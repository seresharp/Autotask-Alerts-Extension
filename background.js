chrome.alarms.onAlarm.addListener(a => {
    // Ignore any other alarms
    if (a.name != "autotask-alert-alarm") return;
    
    chrome.storage.sync.get(["autotask", "queues", "statuses", "schedule", "tickets"]).then(data => {
        // If extension isn't fully configured, we can't run the alerts
        if (!data.autotask || !data.queues || !data.statuses || !data.schedule) return;
        
        // Check that the user is working today before alerting
        const week = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const date = new Date(Date.now());
        const timeStr = date.getHours().toString().padStart(2, "0") + ":" + date.getMinutes().toString().padStart(2, "0");
        if (data.schedule.hours.end >= data.schedule.hours.start) {
            if (!data.schedule.days[week[date.getDay()]]) return;
        } else {
            // Special case, working hours stretch across date boundary
            // If, for example, the day is tuesday but our time is before the start of the workday, we know the user is still working from monday
            const weekDay = timeStr >= data.schedule.hours.start ? data.getDay() : ((date.getDay() - 1) % 7 + 7) % 7;
            if (!data.schedule.days[week[weekDay]]) return;
        }
        
        // Check that we're within working hours before alerting
        if (data.schedule.hours.end >= data.schedule.hours.start) {
            if (timeStr < data.schedule.hours.start || timeStr > data.schedule.hours.end) return;
        } else {
            // Special case for work hours stretching across date boundary again
            if (timeStr < data.schedule.hours.start && timeStr > data.schedule.hours.end) return;
        }
        
        // Build API query for tickets due within an hour from now for the configured queues/statuses
        const dateAlert = new Date(Date.now() + 60 * 60 * 1000);
        const dateAlertStr = dateAlert.getUTCFullYear() + "-" + (dateAlert.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + dateAlert.getUTCDate().toString().padStart(2, "0") + "T" + dateAlert.getUTCHours().toString().padStart(2, "0") + ":" + dateAlert.getUTCMinutes().toString().padStart(2, "0") + ":" + dateAlert.getUTCSeconds().toString().padStart(2, "0") + "Z";
        fetch('https://webservices5.autotask.net/ATServicesRest/V1.0/Tickets/query', {
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
            for (const item of result.items) {
                if (tickets.find(x => x.id == item.id)) continue;
                
                tickets.push({
                    id: item.id,
                    title: item.title,
                    number: item.ticketNumber,
                    due: new Date(item.dueDateTime).getTime(),
                    notifTime: 0,
                    notifId: null
                });
            }
            
            const notifs = [];
            for (const ticket of tickets) {
                // Ticket already notified on within the past 15 minutes
                if (Date.now() - ticket.notifTime < 15 * 60 * 1000) continue;
                
                // Calculate how long until ticket is due
                const dueDiff = Math.abs(ticket.due - Date.now());
                const dueHours = parseInt(dueDiff / 1000 / 60 / 60);
                const dueMinutes = parseInt(dueDiff / 1000 / 60 - dueHours * 60);
                
                // Begin sending/saving notification and store the returned promise
                notifs.push(chrome.notifications.create({
                    type: "basic",
                    requireInteraction: true,
                    iconUrl: "data:image/png;base64,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",
                    title: ticket.due > Date.now() ? `Ticket Due in ${dueHours}h${dueMinutes}m` : `Ticket Due ${dueHours}h${dueMinutes}m Ago`,
                    message: ticket.title,
                    buttons: [{
                        title: "Open Ticket"
                    }]
                }).then(id => {
                    ticket.notifTime = Date.now();
                    ticket.notifId = id;
                }));
            }
            
            // Once all notifications are resolved, save ticket array to storage
            Promise.all(notifs).then(values => {
                chrome.storage.sync.set({ tickets: tickets });
            });
        });
    });
});

// On button click, search for the ticket corresponding to the clicked notification and open it in a new window
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    chrome.storage.sync.get(["tickets"]).then(data => {
        const tickets = data.tickets || [];
        const ticket = tickets.find(x => x.notifId == notificationId);
        if (ticket) {
            chrome.windows.create({
                focused: true,
                type: "popup",
                url: "https://ww5.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?ticketId=" + ticket.id
            });
        }
    });
});

// Add alarm if it doesn't already exist
async function checkAlarmState() {
    const alarm = await chrome.alarms.get("autotask-alert-alarm");
    if (!alarm) await chrome.alarms.create("autotask-alert-alarm", { periodInMinutes: 1 });
}

checkAlarmState();