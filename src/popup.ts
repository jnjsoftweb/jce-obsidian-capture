document.getElementById("captureBtn")!.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "START_CAPTURE" });
});