const getQueuesFromResult = (result) => {
    // Search for queues and status entries in result data
    let queues = null;
    let statuses = null;
    for (const field of result.fields) {
        if (field.name == "queueID") {
            queues = field.picklistValues.map(x => {return {name: x.label, id: parseInt(x.value)}});
        } else if (field.name == "status") {
            statuses = field.picklistValues.map(x => {return {name: x.label, id: parseInt(x.value)}}).filter(x => x.name != "Complete");
        }
    }
    
    // Throw if not found, this should be caught and handled by the calling method
    if (!queues || !statuses) throw new Error("queueID field not found in response json");
    return {queues: queues, statuses: statuses};
};

const populateQueuesList = (queues, statuses) => {
    // Fetch previous selections (if any) from chrome storage
    return chrome.storage.sync.get(["queues", "statuses"]).then(data => {
        const selectedQueues = data.queues || [];
        const selectedStatuses = data.statuses || [];
        
        // Helper method for populating ul with checkbox items
        const fillHTML = (listNode, listItems, prevItems, idPrefix) => {
            // Fetch ul and remove "Loading..." item if present
            listNode = document.getElementById(listNode);
            listNode.innerHTML = "";
            
            for (const item of listItems) {
                // Create new HTML nodes
                const newListItem = document.createElement("li");
                const newLabel = document.createElement("label");
                const newCheckbox = document.createElement("input");
                
                // Set parents appropriately
                listNode.appendChild(newListItem);
                newListItem.appendChild(newLabel);
                newListItem.appendChild(newCheckbox);
                
                // Setup label/checkbox
                newLabel.innerText = item.name;
                newCheckbox.type = "checkbox";
                newCheckbox.className = idPrefix + "Checkbox";
                newCheckbox.id = idPrefix + item.id;
                newCheckbox.checked = prevItems.includes(item.id);
            }
        };
        
        // Fill HTML for queue and status selections
        fillHTML("queueList", queues, selectedQueues, "queue");
        fillHTML("statusList", statuses, selectedStatuses, "status");

        // Show the save button now that selection is possible
        document.getElementById("saveQueues").removeAttribute("style");
    });
};

const saveAPICredentials = () => {
    const region = document.getElementById("Region").value;
    const integration = document.getElementById("ApiIntegrationCode").value;
    const username = document.getElementById("UserName").value;
    const secret = document.getElementById("Secret").value;
    
    // Before saving, we want to run an API query to check that the credentials were entered correctly
    fetch(`https://webservices${region}.autotask.net/ATServicesRest/V1.0/Tickets/entityInformation/fields`, {
        headers: {
            accept: "application/json",
            ApiIntegrationCode: integration,
            UserName: username,
            Secret: secret
        }
    }).then(r => r.json()).then(result => {
        // Fetch queues and statuses from response json
        const {queues, statuses} = getQueuesFromResult(result);
        
        // If this succeeds, we can proceed with saving the api credentials to storage
        chrome.storage.sync.set({
            autotask: {
                Region: region,
                ApiIntegrationCode: integration,
                UserName: username,
                Secret: secret
            }
        }).then(() => {
            // Populate selection lists
            populateQueuesList(queues, statuses).then(() => {
                document.getElementById("saveAPIStatus").innerText = "API credentials saved to storage.";
            }).catch(err => {
                // Populating lists failed (realistically this means storage get failed)
                document.getElementById("saveAPIStatus").innerText = "Failed to populate queue list.";
            });
        }).catch(err => {
            // Storage set failed
            document.getElementById("saveAPIStatus").innerText = "Failed to save API credentials to storage.";
        });
    }).catch(err => {
        // API query failed
        document.getElementById("saveAPIStatus").innerText = "Failed to retrieve queues from Autotask. Please check that entered API credentials are correct.";
    });
};

const saveQueueSelection = () => {
    // Fetch selected queues/statuses from HTML
    const selectedQueues = Array.from(document.getElementsByClassName("queueCheckbox"))
        .filter(x => x.checked)
        .map(x => parseInt(x.id.substr("queue".length)));
    const selectedStatuses = Array.from(document.getElementsByClassName("statusCheckbox"))
        .filter(x => x.checked)
        .map(x => parseInt(x.id.substr("status".length)));
    
    // Attempt saving to storage and notify user of the result
    chrome.storage.sync.set({
        queues: selectedQueues,
        statuses: selectedStatuses
    }).then(() => {
        document.getElementById("saveQueuesStatus").innerText = "Queue/status selections saved to storage.";
    }).catch(err => {
        document.getElementById("saveQueuesStatus").innerText = "Failed to save queue/status selection.";
    });
};

const restoreAPICredentials = () => {
    // Helper method for displaying a message for failure to load credentials
    const showFailureMessage = (message) => {
        document.getElementById("saveAPIStatus").innerText = message;
        document.getElementById("queueList").innerHTML = "<li>Enter API credentials to load queues</li>";
        document.getElementById("statusList").innerHTML = "<li>Enter API credentials to load queues</li>";
    };
    
    // Retrieve API credentials from chrome storage
    chrome.storage.sync.get(["autotask"]).then(data => {
        // Only proceed if we actually have stored credentials
        if (!data.autotask) {
            showFailureMessage("");
            return;
        }

        // Load stored credentials into HTML
        document.getElementById("Region").value = data.autotask.Region;
        document.getElementById("ApiIntegrationCode").value = data.autotask.ApiIntegrationCode;
        document.getElementById("UserName").value = data.autotask.UserName;
        document.getElementById("Secret").value = data.autotask.Secret;
        
        // Make an API query to load queues/statuses from Autotask
        fetch(`https://webservices${data.autotask.Region}.autotask.net/ATServicesRest/V1.0/Tickets/entityInformation/fields`, {
            headers: {
                accept: "application/json",
                ApiIntegrationCode: data.autotask.ApiIntegrationCode,
                UserName: data.autotask.UserName,
                Secret: data.autotask.Secret
            }
        }).then(r => r.json()).then(result => {
            // Fetch from returned json, then populate HTML
            const {queues, statuses} = getQueuesFromResult(result);
            populateQueuesList(queues, statuses).catch(err => {
                showFailureMessage("Failed to populate queue list.");
            });
        }).catch(err => {
            // API query failed
            showFailureMessage("Failed to retrieve queues from Autotask. Please check that saved API credentials are still valid.")
        });
    }).catch(err => {
        // Storage get failed
        showFailureMessage("Failed loading API credentials from storage.");
    });
};

// Add events
document.addEventListener("DOMContentLoaded", restoreAPICredentials);
document.getElementById("saveAPI").addEventListener("click", saveAPICredentials);
document.getElementById("saveQueues").addEventListener("click", saveQueueSelection);