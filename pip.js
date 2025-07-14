// Replace special characters to prevent xss from ticket title/description
const htmlspecialchars = text => text
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const updateTickets = () => chrome.runtime.sendMessage("get-tickets").then(response => {
    const { region, tickets } = response;
    
    // Loop over tickets to build table for display
    let html = "";
    for (const ticket of tickets) {
        // Calculate time until/since ticket due date
        const dueDiff = Math.abs(ticket.due - Date.now());
        const dueHours = Math.trunc(dueDiff / 1000 / 60 / 60);
        const dueMinutes = Math.trunc(dueDiff / 1000 / 60 - dueHours * 60);
        const overdue = Date.now() - ticket.due >= 60;
        
        // Region and ticket id should always be numeric but there's no harm in calling htmlspecialchars anyway to be safe
        html += `<tr>
            <td>${htmlspecialchars(ticket.account)}</td>
            <td>${htmlspecialchars(ticket.title)}</td>
            <td class="${overdue ? "overdue" : ""}">${dueHours}h${dueMinutes}m${overdue ? " Ago" : ""}</td>
            <td>
                ${ticket.id != 0 ? `<a href='https://ww${htmlspecialchars(region)}.autotask.net/Autotask/AutotaskExtend/ExecuteCommand.aspx?Code=OpenTicketTime&TicketID=${htmlspecialchars(ticket.id)}' target='_blank'>Enter Time</a>` : ""}
            </td>
        </tr>`;
    }
    
    // Set inner html of iframe table
    const tbody = Array.from(document.getElementById("tickets").childNodes).filter(x => x.nodeName == "TBODY")[0];
    tbody.innerHTML = html;
}).finally(() => {
    // After promise resolves, queue another check 5 seconds from now
    setTimeout(updateTickets, 5000);
});

// Begin update cycle
updateTickets();