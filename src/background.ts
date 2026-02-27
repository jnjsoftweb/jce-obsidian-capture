// background.ts (Manifest v3 service worker)

import { getHandle } from "./db";

/**
 * 메시지 리스너
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CAPTURE_VISIBLE") {
    captureVisible(msg.format)
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => {
        console.error("Background error:", err);
        sendResponse({ error: String(err) });
      });

    return true;
  }
});

async function captureVisible(
  format: "png" | "jpeg" | "webp"
): Promise<string> {
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
    format,
  });

  return dataUrl;
}

/**
 * 현재 활성 탭을 캡처하고
 * 선택된 Vault 폴더에 직접 저장
 */
async function captureAndSave(): Promise<void> {
  // 1️⃣ 활성 탭 조회
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id || !tab.url) {
    throw new Error("No active tab found.");
  }

  // 2️⃣ 설정 불러오기
  const { imageFormat } = await chrome.storage.local.get("imageFormat");
  const format: "png" | "jpeg" | "webp" = imageFormat || "png";

  // 3️⃣ Vault 핸들 가져오기 (IndexedDB)
  const vaultHandle = await getHandle();

  if (!vaultHandle) {
    throw new Error("Vault 폴더를 먼저 선택하세요 (옵션에서 설정).");
  }

  // 4️⃣ 현재 화면 캡처
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
    format,
  });

  // dataURL → Blob 변환
  const blob = await (await fetch(dataUrl)).blob();

  // 5️⃣ 날짜 기반 폴더 생성 (YYYY-MM)
  const now = new Date();
  const monthFolder = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

  // Vault/WebCaptures/YYYY-MM
  const webCapturesDir =
    await vaultHandle.getDirectoryHandle("WebCaptures", {
      create: true,
    });

  const monthDir =
    await webCapturesDir.getDirectoryHandle(monthFolder, {
      create: true,
    });

  // 6️⃣ 파일 이름 생성
  const hostname = new URL(tab.url).hostname;
  const timestamp = now.toISOString().replace(/[:.]/g, "-");

  const extension = format === "jpeg" ? "jpg" : format;

  const fileName = `${hostname}-${timestamp}.${extension}`;

  // 7️⃣ 파일 생성
  const fileHandle =
    await monthDir.getFileHandle(fileName, {
      create: true,
    });

  const writable = await fileHandle.createWritable();

  await writable.write(blob);
  await writable.close();
}