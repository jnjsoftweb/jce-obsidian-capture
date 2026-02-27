// background.ts (MV3 service worker)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then((res) => sendResponse(res))
    .catch((err) => {
      console.error("Background error:", err);
      sendResponse({ error: String(err) });
    });

  return true; // async response 허용
});

async function handleMessage(msg: any): Promise<any> {
  switch (msg.type) {
    case "CAPTURE_FULL_PAGE":
      return await handleFullCapture();

    case "CAPTURE_VISIBLE":
      return await captureVisible();

    case "SAVE_DATA_URL":
      return await saveDataUrl(msg.dataUrl, msg.fileName);

    default:
      return null;
  }
}

/**
 * popup → background
 * 현재 활성 탭에 START_CAPTURE 전달
 */
async function handleFullCapture() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, {
      type: "START_CAPTURE",
    });
  } catch (err) {
    throw new Error(
      "Content script not loaded. Refresh the page and try again."
    );
  }
}

/**
 * contentScript → background
 * 현재 보이는 화면 캡처
 */
async function captureVisible(): Promise<{ dataUrl: string }> {
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
    format: "png",
  });

  return { dataUrl };
}

/**
 * contentScript → background
 * 다운로드 폴더에 저장
 */
async function saveDataUrl(dataUrl: string, fileName: string) {
  await chrome.downloads.download({
    url: dataUrl,
    filename: `WebCaptures/${fileName}`,
    saveAs: false,
  });

  return { success: true };
}