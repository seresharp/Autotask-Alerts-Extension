// Call open_pip.js on extension click
chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ["open_pip.js"]
    });
});

// Respond with tickets when queried
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message == "get-tickets") {
        chrome.storage.sync.get(["autotask", "queues", "statuses", "tickets"]).then(data => {
            // If extension isn't fully configured, we can't run the alerts
            if (!data.autotask || !data.queues || !data.statuses) {
                sendResponse({
                    region: 0,
                    tickets: [{
                        id: 0,
                        account: "Error",
                        title: "Please configure extension options before use",
                        number: 0,
                        due: Date.now()
                    }]
                });
                
                return Promise.resolve();
            }

            // Build API query for tickets due within an hour from now for the configured queues/statuses
            const dateAlert = new Date(Date.now() + 60 * 60 * 1000);
            const dateAlertStr = dateAlert.getUTCFullYear() + "-" + (dateAlert.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + dateAlert.getUTCDate().toString().padStart(2, "0") + "T" + dateAlert.getUTCHours().toString().padStart(2, "0") + ":" + dateAlert.getUTCMinutes().toString().padStart(2, "0") + ":" + dateAlert.getUTCSeconds().toString().padStart(2, "0") + "Z";
            return fetch(`https://webservices${data.autotask.Region}.autotask.net/ATServicesRest/V1.0/Tickets/query`, {
                method: 'POST',
                headers: {
                    accept: "application/json",
                    "Content-Type": "application/json",
                    ApiIntegrationCode: data.autotask.ApiIntegrationCode,
                    UserName: data.autotask.UserName,
                    Secret: data.autotask.Secret
                },
                body: JSON.stringify({
                    Filter: [
                        {
                            op: "and",
                            items: [
                                {
                                    op: "or",
                                    items: data.queues.map(x => ({
                                        op: "eq",
                                        field: "queueID",
                                        value: x
                                    }))
                                },
                                {
                                    op: "or",
                                    items: data.statuses.map(x => ({
                                        op: "eq",
                                        field: "status",
                                        value: x
                                    }))
                                },
                                {
                                    op: "lte",
                                    field: "dueDateTime",
                                    value: dateAlertStr
                                }
                            ]
                        }
                    ]
                })
            }).then(r => r.json()).then(result => {
                const tickets = data.tickets || [];
                
                // Update stored tickets array with accurate title/due
                for (let i = tickets.length - 1; i >= 0; i--) {
                    const item = result.items.find(x => x.id == tickets[i].id);
                    if (item) {
                        tickets[i].title = item.title;
                        tickets[i].due = new Date(item.dueDateTime).getTime();
                    } else {
                        // If ticket isn't found in the data from the API, it's either been completed or is no longer due within the hour
                        // We have no reason to continue tracking it in either of these cases
                        tickets.splice(i, 1);
                    }
                }
                
                // Insert new tickets from the query into our tracking list
                // Autotask doesn't allow concurrency for API calls despite the high per hour rate limit
                // So to fetch all company names we keep track of the previous promise to execute them in series
                let prevPromise = new Promise(r => setTimeout(() => { r(); }, 1));
                for (const item of result.items) {
                    if (tickets.find(x => x.id == item.id)) continue;
                    
                    prevPromise = prevPromise.then(() => fetch(`https://webservices${data.autotask.Region}.autotask.net/ATServicesRest/V1.0/Companies/query`, {
                        method: 'POST',
                        headers: {
                            accept: "application/json",
                            "Content-Type": "application/json",
                            ApiIntegrationCode: data.autotask.ApiIntegrationCode,
                            UserName: data.autotask.UserName,
                            Secret: data.autotask.Secret
                        },
                        body: JSON.stringify({
                            Filter: [
                                {
                                    op: "eq",
                                    field: "id",
                                    value: item.companyID
                                }
                            ]
                        })
                    }).then(r => r.json()).then(resultCompany => {
                        tickets.push({
                            id: item.id,
                            account: resultCompany.items.length > 0 ? resultCompany.items[0].companyName : "",
                            title: item.title,
                            number: item.ticketNumber,
                            due: new Date(item.dueDateTime).getTime()
                        });
                    }));
                }
                
                // Wait for the last company promise to resolve (might take a bit depending how many fetches are queued)
                return prevPromise.then(() => {
                    tickets.sort((a, b) => a.due - b.due);
                    chrome.storage.sync.set({ tickets: tickets });
                    sendResponse({
                        region: data.autotask.Region,
                        tickets: tickets
                    });
                });
            });
        }).catch(() => {
            // Let the user know if there was an error
            sendResponse({
                region: 0,
                tickets: [{
                    id: 0,
                    account: "Error",
                    title: "Failed fetching tickets, please check extension options",
                    number: 0,
                    due: Date.now()
                }]
            });
        });
        
        // Return true to indicate an asynchronous response
        return true;
    }
});
