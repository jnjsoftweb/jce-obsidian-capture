const captureBtn = document.getElementById("capture")!;
const statusEl = document.getElementById("status")!;

captureBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CAPTURE_FULL_PAGE" });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "CAPTURE_SUCCESS") {
    statusEl.textContent = `Saved: ${msg.fileName}`;
  }

  if (msg.type === "CAPTURE_ERROR") {
    statusEl.textContent = `Error: ${msg.error}`;
  }
});