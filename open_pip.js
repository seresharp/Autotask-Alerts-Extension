// Check that we don't already have a pip open
if (!window.documentPictureInPicture.window) {
    window.documentPictureInPicture.requestWindow({
        width: 320,
        height: 240,
        disallowReturnToOpener: true,
        preferInitialWindowPlacement: true
    }).then((pip) => {
        // Create the iframe to our pip.html within the pip window
        const iframe = pip.document.createElement("iframe");
        iframe.style.width = "100vw";
        iframe.style.height = "100vh";
        iframe.style.position = "absolute";
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.src = chrome.runtime.getURL("pip.html");
        pip.document.body.append(iframe);
        pip.document.body.style.overflow = "hidden";
        
        // Alert the user every 15 minutes how many tickets are overdue
        // Unlike a windows notification, this requires user interaction to proceed
        var interval = setInterval(() => chrome.storage.sync.get(["tickets"]).then(data => {
            if (data.tickets && data.tickets.length > 0) alert(`${data.tickets.length} tickets need attention!`);
        }), 15 * 60 * 60 * 1000);
        
        // Stop alerting if user closes the pip window
        // In theory if the user closes then reopens the extension within 250ms we have two alert intervals running
        // This seems like an unlikely edge case
        var interval2 = setInterval(() => {
            if (!window.documentPictureInPicture.window) {
                clearInterval(interval);
                clearInterval(interval2);
            }
        }, 250);
    });
}