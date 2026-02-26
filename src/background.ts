// background.ts (Manifest v3 Service Worker)

async function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * 현재 탭에 content script 강제 주입
 */
async function ensureContentScript(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["dist/contentScript.js"]
  });
}

/**
 * dataURL → ImageBitmap (Worker 환경용)
 */
async function loadImage(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return await createImageBitmap(blob);
}

/**
 * Blob → dataURL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * 여러 스크린샷을 하나로 stitching
 */
async function stitchImages(images: string[]): Promise<string> {
  const bitmaps = await Promise.all(images.map(loadImage));

  const width = bitmaps[0].width;
  const height = bitmaps.reduce((sum, img) => sum + img.height, 0);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;

  let y = 0;
  for (const img of bitmaps) {
    ctx.drawImage(img, 0, y);
    y += img.height;
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });

  // Blob → dataURL
  const reader = new FileReader();
  return new Promise((resolve) => {
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * 파일명 정리
 */
function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "").slice(0, 100);
}

/**
 * 전체 페이지 캡처
 */
async function captureFullPage(tabId: number) {
  // 페이지 정보 요청
  const pageInfo = await chrome.tabs.sendMessage(tabId, {
    type: "GET_PAGE_INFO"
  });

  if (!pageInfo) {
    console.error("Failed to get page info");
    return;
  }

  const { totalHeight, viewportHeight, title, url } = pageInfo;

  const images: string[] = [];
  let scrollY = 0;

  while (scrollY < totalHeight) {
    await chrome.tabs.sendMessage(tabId, {
      type: "SCROLL_TO",
      y: scrollY
    });

    await delay(400);

    const dataUrl = await chrome.tabs.captureVisibleTab({
      format: "png"
    });

    images.push(dataUrl);

    scrollY += viewportHeight;
  }

  const finalImage = await stitchImages(images);

  const fileBase = sanitizeFileName(title);

  // PNG 저장
  await chrome.downloads.download({
    url: finalImage,
    filename: `WebCaptures/${fileBase}.png`
  });

  // Markdown 생성
  const markdown = `
# ${title}

URL: ${url}

![[${fileBase}.png]]
`;

  const mdData =
    "data:text/markdown;base64," +
    btoa(unescape(encodeURIComponent(markdown)));

  await chrome.downloads.download({
    url: mdData,
    filename: `WebCaptures/${fileBase}.md`
  });

  console.log("Capture complete");
}

/**
 * popup → background 메시지 리스너
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "START_CAPTURE") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;

      try {
        // 🔥 content script 강제 주입
        await ensureContentScript(tab.id);

        // 🔥 전체 캡처 실행
        await captureFullPage(tab.id);
      } catch (err) {
        console.error("Capture failed:", err);
      }
    });
  }
});