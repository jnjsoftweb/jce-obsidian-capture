// background.ts (Manifest v3 service worker)

const OFFSCREEN_URL = "src/offscreen/offscreen.html";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CAPTURE_VISIBLE") {
    // content script에서 온 경우 sender.tab?.windowId 사용
    // → captureVisibleTab(undefined) 은 SW에서 잘못된 윈도우를 참조할 수 있음
    const windowId = sender.tab?.windowId;
    captureVisible(msg.format || "png", windowId)
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => {
        console.error("Background capture error:", err);
        sendResponse({ error: String(err) });
      });
    return true;
  }

  if (msg.type === "ACTIVATE_ELEMENT_PICKER") {
    activateElementPicker()
      .catch((err) => console.error("Picker error:", err));
    sendResponse(true);
    return true;
  }

  if (msg.type === "SAVE_SCROLL_CAPTURE") {
    handleSaveScrollCapture(msg.dataUrls, sendResponse)
      .catch((err) => {
        console.error("SAVE_SCROLL_CAPTURE error:", err);
        sendResponse({ noVault: true });
      });
    return true;
  }

  if (msg.type === "PICKER_DONE") {
    if (!msg.success && !msg.cancelled) {
      chrome.action.setBadgeText({ text: "ERR" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
    } else if (!msg.success && msg.cancelled) {
      chrome.action.setBadgeText({ text: "" });
    }
    sendResponse(true);
    return true;
  }
});

async function captureVisible(
  format: "png" | "jpeg" | "webp",
  windowId?: number
): Promise<string> {
  return chrome.tabs.captureVisibleTab(windowId, { format });
}

/**
 * 내부 스크롤 캡처: 콘텐츠 스크립트에 피커 모드 시작 요청
 */
async function activateElementPicker(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) return;

  chrome.action.setBadgeText({ text: "..." });
  chrome.action.setBadgeBackgroundColor({ color: "#0078FF" });

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "START_PICKER" });
  } catch {
    // 콘텐츠 스크립트 미로드 시 동적 주입
    try {
      const manifest = chrome.runtime.getManifest();
      const files = manifest.content_scripts?.[0]?.js;
      if (files?.length) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files,
        });
        await new Promise((r) => setTimeout(r, 150));
        await chrome.tabs.sendMessage(tab.id, { type: "START_PICKER" });
      }
    } catch (err) {
      console.error("Cannot start picker:", err);
      chrome.action.setBadgeText({ text: "ERR" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
    }
  }
}

/**
 * 내부 스크롤 캡처 저장: offscreen document를 통해 File System Access API로 저장
 */
async function handleSaveScrollCapture(
  dataUrls: string[],
  sendResponse: (response: unknown) => void
): Promise<void> {
  const data = await chrome.storage.local.get([
    "vaultName",
    "vaultSubFolder",
    "imageFormat",
  ]);

  if (!data.vaultName) {
    sendResponse({ noVault: true });
    return;
  }

  const format: string = data.imageFormat || "png";
  const subFolder: string = data.vaultSubFolder || "";

  try {
    const result = await saveScrollCaptureViaOffscreen(dataUrls, format, subFolder);

    if (result?.ok) {
      chrome.action.setBadgeText({ text: "OK!" });
      chrome.action.setBadgeBackgroundColor({ color: "#00AA44" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
      sendResponse({ ok: true });
    } else {
      sendResponse({ noVault: true });
    }
  } catch (err) {
    console.error("offscreen save failed:", err);
    sendResponse({ noVault: true });
  }
}

async function saveScrollCaptureViaOffscreen(
  dataUrls: string[],
  format: string,
  subFolder: string
): Promise<{ ok?: boolean; noVault?: boolean; error?: string }> {
  await ensureOffscreenDocument();

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        target: "offscreen",
        type: "SAVE_SCROLL_CAPTURE",
        dataUrls,
        format,
        subFolder,
      },
      (response) => {
        resolve(response || { noVault: true });
      }
    );
  });
}

async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: "Save captured image to vault via File System Access API",
    });
    // createDocument는 HTML 파싱 완료 전에 resolve될 수 있으므로
    // offscreen 스크립트의 onMessage 리스너가 등록될 때까지 짧게 대기
    await new Promise((r) => setTimeout(r, 200));
  }
}
