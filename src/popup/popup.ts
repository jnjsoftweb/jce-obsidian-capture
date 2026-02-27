import { getHandle } from "../db";

document.addEventListener("DOMContentLoaded", () => {
  const captureBtn = document.getElementById(
    "captureBtn"
  ) as HTMLButtonElement;

  const innerScrollBtn = document.getElementById(
    "innerScrollBtn"
  ) as HTMLButtonElement;

  const openOptionsBtn = document.getElementById(
    "openOptions"
  ) as HTMLButtonElement;

  const statusText = document.getElementById(
    "status"
  ) as HTMLParagraphElement;

  if (!captureBtn || !statusText || !openOptionsBtn || !innerScrollBtn) {
    console.error("Popup elements not found.");
    return;
  }

  openOptionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // ── 현재 화면 캡처 ──────────────────────────────
  captureBtn.addEventListener("click", async () => {
    try {
      statusText.textContent = "캡처 중...";

      const data = await chrome.storage.local.get([
        "imageFormat",
        "useScroll",
        "vaultName",
        "vaultSubFolder",
      ]);

      const format: "png" | "jpeg" | "webp" = data.imageFormat || "png";
      const useScroll: boolean = data.useScroll !== false; // 기본값 true
      const vaultName: string = data.vaultName || "";
      const subFolder: string = data.vaultSubFolder || "";

      // vault handle 확보 (user gesture가 살아있는 시점)
      let vaultHandle: FileSystemDirectoryHandle | null = null;
      if (vaultName) {
        const handle = await getHandle();
        if (handle) {
          const perm = await handle.queryPermission({ mode: "readwrite" });
          if (perm === "granted") {
            vaultHandle = handle;
          } else if (perm === "prompt") {
            const newPerm = await handle.requestPermission({ mode: "readwrite" });
            if (newPerm === "granted") {
              vaultHandle = handle;
            }
          }
        }
      }

      // 캡처
      let dataUrl: string;

      if (useScroll) {
        statusText.textContent = "전체 페이지 캡처 중...";
        dataUrl = await captureFullPage(format);
      } else {
        const response = await chrome.runtime.sendMessage({
          type: "CAPTURE_VISIBLE",
          format,
        });

        if (!response?.dataUrl) {
          statusText.textContent = "캡처 실패";
          return;
        }

        dataUrl = response.dataUrl;
      }

      // 저장
      if (vaultHandle) {
        await saveToVaultHandle(vaultHandle, dataUrl, format, subFolder);
      } else {
        // fallback: 폴더 직접 선택
        const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        await saveToVaultHandle(dirHandle, dataUrl, format, subFolder);
      }

      statusText.textContent = "저장 완료!";
    } catch (err) {
      console.error("Popup error:", err);
      statusText.textContent = "오류 발생";
    }
  });

  // ── 내부 스크롤 캡처 ────────────────────────────
  // element picker를 활성화하고 팝업을 닫습니다.
  // 캡처 완료 후 저장은 content script에서 자동 저장 시도 후 필요 시 토스트로 처리합니다.
  innerScrollBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "ACTIVATE_ELEMENT_PICKER" });
    window.close();
  });
});

// ── 전체 페이지 스크롤 캡처 ──────────────────────

async function captureFullPage(
  format: "png" | "jpeg" | "webp"
): Promise<string> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) throw new Error("No active tab");

  const [pageInfoResult] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      totalHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      dpr: window.devicePixelRatio || 1,
    }),
  });

  const { totalHeight, viewportHeight, viewportWidth, dpr } =
    pageInfoResult.result as {
      totalHeight: number;
      viewportHeight: number;
      viewportWidth: number;
      dpr: number;
    };

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewportWidth * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  const ctx = canvas.getContext("2d")!;

  let scrollY = 0;

  while (scrollY < totalHeight) {
    const actualScrollY = Math.max(
      0,
      Math.min(scrollY, totalHeight - viewportHeight)
    );

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (y: number) => { window.scrollTo(0, y); },
      args: [actualScrollY],
    });

    await delay(300);

    const response = await chrome.runtime.sendMessage({
      type: "CAPTURE_VISIBLE",
      format,
    });

    if (!response?.dataUrl) throw new Error("Capture failed");

    const img = await loadImage(response.dataUrl);

    const srcY_css = scrollY - actualScrollY;
    const drawHeight_css = Math.min(
      viewportHeight - srcY_css,
      totalHeight - scrollY
    );

    const pSrcY  = Math.round(srcY_css      * dpr);
    const pDestY = Math.round(scrollY        * dpr);
    const pWidth = Math.round(viewportWidth  * dpr);
    const pH     = Math.round(drawHeight_css * dpr);

    ctx.drawImage(
      img,
      0, pSrcY, pWidth, pH,
      0, pDestY, pWidth, pH
    );

    scrollY += viewportHeight - srcY_css;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => { window.scrollTo(0, 0); },
  });

  const mimeType =
    format === "jpeg" ? "image/jpeg" :
    format === "webp" ? "image/webp" :
    "image/png";

  return canvas.toDataURL(mimeType);
}

// ── 유틸 ─────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * vault handle에 이미지를 저장합니다.
 * subFolder 지정 시 해당 경로에 저장, 미지정 시 WebCaptures/YYYY-MM 에 저장합니다.
 */
async function saveToVaultHandle(
  vaultHandle: FileSystemDirectoryHandle,
  dataUrl: string,
  format: string,
  subFolder: string
): Promise<void> {
  // fetch 대신 atob 기반 변환: 대용량 data URL에서의 fetch 실패 방지
  const blob = dataUrlToBlob(dataUrl);
  if (blob.size === 0) {
    throw new Error("EMPTY_BLOB: data URL produced an empty blob");
  }

  const now = new Date();
  const ext = format === "jpeg" ? "jpg" : format;
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const fileName = `capture-${timestamp}.${ext}`;

  let targetDir: FileSystemDirectoryHandle;

  if (subFolder) {
    const parts = subFolder.split("/").filter(Boolean);
    let cur = vaultHandle;
    for (const part of parts) {
      cur = await cur.getDirectoryHandle(part, { create: true });
    }
    targetDir = cur;
  } else {
    const monthFolder = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
    const webCapturesDir = await vaultHandle.getDirectoryHandle("WebCaptures", {
      create: true,
    });
    targetDir = await webCapturesDir.getDirectoryHandle(monthFolder, {
      create: true,
    });
  }

  // write 실패 시 0바이트 파일이 남지 않도록 abort + 삭제 처리
  const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => {});
    await targetDir.removeEntry(fileName).catch(() => {});
    throw err;
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return new Blob([]);

  const meta = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);

  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";

  if (!base64) return new Blob([], { type: mime });

  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
