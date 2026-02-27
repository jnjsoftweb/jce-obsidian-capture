// contentScript.ts
// 페이지에 자동 주입됨 (manifest content_scripts)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_CAPTURE") {
    startCapture()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ error: String(err) }));

    return true; // async 허용
  }
  if (msg.type === "GET_PAGE_INFO") {
    sendResponse({
      totalHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    });
  }

  if (msg.type === "SCROLL_TO") {
    window.scrollTo(0, msg.y);
    sendResponse(true);
  }

  return true;
});

async function startCapture(): Promise<{ fileName: string }> {
  // 1️⃣ background에 현재 화면 캡처 요청
  const captureResponse = await chrome.runtime.sendMessage({
    type: "CAPTURE_VISIBLE",
  });

  if (!captureResponse?.dataUrl) {
    throw new Error("Failed to capture visible tab");
  }

  // 2️⃣ 파일 이름 생성 (페이지 제목 기반)
  const pageTitle = sanitizeFileName(document.title);
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const fileName = `${pageTitle}-${timestamp}.png`;

  // 3️⃣ background에 저장 요청
  await chrome.runtime.sendMessage({
    type: "SAVE_DATA_URL",
    dataUrl: captureResponse.dataUrl,
    fileName,
  });

  return { fileName };
}

/**
 * 파일명에 사용할 수 없는 문자 제거
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 100);
}