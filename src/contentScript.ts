// contentScript.ts

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_CAPTURE") {
    startCapture()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
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

  if (msg.type === "START_PICKER") {
    activateElementPicker();
    sendResponse(true);
  }

  return true;
});

// ─────────────────────────────────────────────
// 기존 전체 페이지 캡처 (START_CAPTURE)
// ─────────────────────────────────────────────

async function startCapture(): Promise<{ fileName: string }> {
  const captureResponse = await chrome.runtime.sendMessage({
    type: "CAPTURE_VISIBLE",
  });

  if (!captureResponse?.dataUrl) {
    throw new Error("Failed to capture visible tab");
  }

  const pageTitle = sanitizeFileName(document.title);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${pageTitle}-${timestamp}.png`;

  await chrome.runtime.sendMessage({
    type: "SAVE_DATA_URL",
    dataUrl: captureResponse.dataUrl,
    fileName,
  });

  return { fileName };
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 100);
}

// ─────────────────────────────────────────────
// 내부 스크롤 캡처 — 피커 오버레이
// ─────────────────────────────────────────────

function activateElementPicker(): void {
  if (document.getElementById("__jce_style")) return;

  const style = document.createElement("style");
  style.id = "__jce_style";
  style.textContent = `
    .__jce_highlight {
      outline: 3px solid #0078FF !important;
      outline-offset: -2px !important;
      cursor: crosshair !important;
    }
    #__jce_tooltip {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 8px 18px;
      border-radius: 6px;
      font-size: 13px;
      font-family: sans-serif;
      z-index: 2147483647;
      pointer-events: none;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);

  const tooltip = document.createElement("div");
  tooltip.id = "__jce_tooltip";
  tooltip.textContent = "스크롤 가능한 영역을 클릭하세요  (ESC: 취소)";
  document.body.appendChild(tooltip);

  let highlighted: Element | null = null;

  function getScrollableAncestor(el: Element): Element | null {
    let cur: Element | null = el;
    while (cur && cur !== document.documentElement) {
      const ov = getComputedStyle(cur).overflowY;
      if (
        (ov === "scroll" || ov === "auto") &&
        cur.scrollHeight > cur.clientHeight + 1
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown);
    if (highlighted) highlighted.classList.remove("__jce_highlight");
    document.getElementById("__jce_style")?.remove();
    document.getElementById("__jce_tooltip")?.remove();
  }

  function onMouseMove(e: MouseEvent) {
    if (highlighted) {
      highlighted.classList.remove("__jce_highlight");
      highlighted = null;
    }
    const scrollable = getScrollableAncestor(e.target as Element);
    if (scrollable) {
      scrollable.classList.add("__jce_highlight");
      highlighted = scrollable;
    }
  }

  async function onClick(e: MouseEvent) {
    const scrollable = getScrollableAncestor(e.target as Element);
    if (!scrollable) return;

    e.preventDefault();
    e.stopPropagation();
    cleanup();

    const toast = createToast("캡처 중...");

    try {
      const dataUrl = await captureScrollableElement(
        scrollable as HTMLElement
      );

      // 자동 저장 시도 (vault 설정된 경우)
      toast.textContent = "저장 중...";
      let autoSaved = false;
      try {
        const result = await chrome.runtime.sendMessage({
          type: "SAVE_SCROLL_CAPTURE",
          dataUrl,
        });
        if (result?.ok) {
          autoSaved = true;
          toast.textContent = "저장 완료!";
          chrome.runtime.sendMessage({ type: "PICKER_DONE", success: true });
          setTimeout(() => toast.remove(), 2500);
        }
      } catch {
        // 자동 저장 실패 시 수동 저장으로 fallback
      }

      if (!autoSaved) {
        // vault 미설정 또는 권한 없음 → 수동 저장 토스트
        showSaveToast(toast, dataUrl);
      }
    } catch (err) {
      console.error("Inner scroll capture error:", err);
      toast.textContent =
        "캡처 실패: " + (err instanceof Error ? err.message : String(err));
      chrome.runtime.sendMessage({ type: "PICKER_DONE", success: false });
      setTimeout(() => toast.remove(), 4000);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      cleanup();
      chrome.runtime.sendMessage({
        type: "PICKER_DONE",
        success: false,
        cancelled: true,
      });
    }
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown);
}

// ─────────────────────────────────────────────
// 저장 버튼 토스트
// ─────────────────────────────────────────────

/**
 * 캡처 완료 후 "저장 폴더 선택" 버튼을 포함한 토스트를 표시합니다.
 * 버튼 클릭 시 user gesture가 살아있으므로 showDirectoryPicker()가 정상 동작합니다.
 */
function showSaveToast(toast: HTMLElement, dataUrl: string): void {
  toast.textContent = "";
  toast.style.pointerEvents = "auto";
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.gap = "10px";

  const label = document.createElement("span");
  label.textContent = "캡처 완료";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "저장 폴더 선택";
  saveBtn.style.cssText = [
    "cursor:pointer", "padding:4px 12px",
    "border-radius:4px", "border:none",
    "background:#0078FF", "color:white",
    "font-size:12px", "font-family:sans-serif",
  ].join(";");

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = [
    "cursor:pointer", "padding:2px 8px",
    "border-radius:4px", "border:none",
    "background:rgba(255,255,255,0.2)", "color:white",
    "font-size:12px",
  ].join(";");

  toast.appendChild(label);
  toast.appendChild(saveBtn);
  toast.appendChild(closeBtn);

  // 30초 후 자동 제거
  const autoClose = setTimeout(() => {
    if (toast.isConnected) {
      toast.remove();
      chrome.runtime.sendMessage({ type: "PICKER_DONE", success: false, cancelled: true });
    }
  }, 30000);

  saveBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    clearTimeout(autoClose);

    let dirHandle: FileSystemDirectoryHandle;
    try {
      // user gesture가 유효한 시점에 호출 (버튼 클릭 = user gesture)
      dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch {
      return; // 사용자가 취소
    }

    toast.textContent = "저장 중...";
    toast.style.pointerEvents = "none";

    try {
      await saveToDirectory(dirHandle, dataUrl);
      toast.textContent = "저장 완료!";
      chrome.runtime.sendMessage({ type: "PICKER_DONE", success: true });
    } catch (err) {
      console.error("Save error:", err);
      toast.textContent = "저장 실패: " + (err instanceof Error ? err.message : String(err));
      chrome.runtime.sendMessage({ type: "PICKER_DONE", success: false });
    }
    setTimeout(() => toast.remove(), 2500);
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearTimeout(autoClose);
    toast.remove();
    chrome.runtime.sendMessage({ type: "PICKER_DONE", success: false, cancelled: true });
  });
}

// ─────────────────────────────────────────────
// 내부 스크롤 캡처 — 이미지 합성
// ─────────────────────────────────────────────

// Chrome의 캔버스 최대 크기 제한.
// 이 값을 초과하면 toDataURL()이 에러 없이 "data:," (빈 결과)를 반환한다.
const MAX_CANVAS_DIM = 16383;

async function captureScrollableElement(
  element: HTMLElement
): Promise<string> {
  const origScrollTop = element.scrollTop;

  const ew = element.clientWidth;
  const eh = element.clientHeight;
  const eH = element.scrollHeight;
  const dpr = window.devicePixelRatio || 1;

  // 캔버스 높이가 MAX_CANVAS_DIM을 초과하지 않도록 DPR을 낮춤.
  // dpr=2, eH=10000px → effectiveDpr=1, canvas.height=10000px (제한 이내)
  // dpr=2, eH=5000px  → effectiveDpr=2, canvas.height=10000px (정상)
  const effectiveDpr = Math.max(
    1,
    Math.min(dpr, Math.floor(MAX_CANVAS_DIM / eH))
  );

  const canvasHeight = Math.round(eH * effectiveDpr);
  if (canvasHeight > MAX_CANVAS_DIM) {
    throw new Error(
      `스크롤 영역이 너무 깁니다 (${eH}px). 더 짧은 영역을 선택해 주세요.`
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ew * effectiveDpr);
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d")!;

  let scrollTop = 0;

  while (scrollTop < eH) {
    const actualScrollTop = Math.max(0, Math.min(scrollTop, eH - eh));
    element.scrollTop = actualScrollTop;

    await delay(500);

    const imgDataUrl = await captureVisibleWithRetry();
    const img = await loadImage(imgDataUrl);

    const rect = element.getBoundingClientRect();
    const offsetInView = scrollTop - actualScrollTop;
    const sliceHeight = Math.min(eh - offsetInView, eH - scrollTop);

    // src: 스크린샷은 물리 픽셀(dpr) 단위
    const srcX = Math.round(rect.left * dpr);
    const srcY = Math.round((rect.top + offsetInView) * dpr);
    const srcW = Math.round(ew * dpr);
    const srcH = Math.round(sliceHeight * dpr);

    // dest: 캔버스는 effectiveDpr 단위 (크기 제한 적용 시 dpr과 다를 수 있음)
    const destY = Math.round(scrollTop * effectiveDpr);
    const destW = Math.round(ew * effectiveDpr);
    const destH = Math.round(sliceHeight * effectiveDpr);

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, destY, destW, destH);

    scrollTop += eh - offsetInView;
  }

  element.scrollTop = origScrollTop;

  const { imageFormat } = await chrome.storage.local.get("imageFormat");
  const format: string = imageFormat || "png";
  const mimeType =
    format === "jpeg" ? "image/jpeg" :
    format === "webp" ? "image/webp" :
    "image/png";

  const result = canvas.toDataURL(mimeType);

  // toDataURL()이 빈 결과를 반환하는 경우: 캔버스 크기 초과 또는 메모리 부족
  if (!result || result === "data:," || !result.startsWith("data:image/")) {
    throw new Error(
      `이미지 생성 실패 (캔버스 ${canvas.width}×${canvas.height}px). ` +
      `스크롤 영역이 너무 길어 처리할 수 없습니다.`
    );
  }

  return result;
}

async function captureVisibleWithRetry(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await delay(700 * attempt);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CAPTURE_VISIBLE",
      });
      if (response?.dataUrl) return response.dataUrl;
    } catch (err) {
      if (attempt === 2) throw new Error(`Capture failed: ${err}`);
      console.warn(`Capture attempt ${attempt + 1} failed, retrying...`);
    }
  }
  throw new Error("Capture failed after 3 attempts");
}

// ─────────────────────────────────────────────
// 저장 (vault 디렉터리에 직접 씁니다)
// ─────────────────────────────────────────────

async function saveToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  dataUrl: string
): Promise<void> {
  const { imageFormat } = await chrome.storage.local.get("imageFormat");
  const format: string = imageFormat || "png";
  const ext = format === "jpeg" ? "jpg" : format;

  // fetch 대신 atob 기반 변환: 대용량 data URL 안정성 확보
  const blob = dataUrlToBlob(dataUrl);
  if (blob.size === 0) {
    throw new Error("캡처 데이터가 비어있습니다.");
  }

  const now = new Date();
  const monthFolder = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const fileName = `scroll-${timestamp}.${ext}`;

  const webCapturesDir = await dirHandle.getDirectoryHandle("WebCaptures", {
    create: true,
  });
  const monthDir = await webCapturesDir.getDirectoryHandle(monthFolder, {
    create: true,
  });

  // write 실패 시 0바이트 파일이 남지 않도록 abort + 삭제
  const fileHandle = await monthDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => {});
    await monthDir.removeEntry(fileName).catch(() => {});
    throw err;
  }
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────

/**
 * data URL을 Blob으로 변환합니다.
 * fetch() 대신 atob()를 사용해 대용량 data URL에서의 fetch 실패를 방지합니다.
 */
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

function createToast(text: string): HTMLElement {
  document.getElementById("__jce_toast")?.remove();
  const el = document.createElement("div");
  el.id = "__jce_toast";
  el.style.cssText = [
    "position:fixed", "top:12px", "left:50%",
    "transform:translateX(-50%)",
    "background:rgba(0,0,0,.85)", "color:#fff",
    "padding:8px 18px", "border-radius:6px",
    "font-size:13px", "font-family:sans-serif",
    "z-index:2147483647", "pointer-events:none",
    "white-space:nowrap",
  ].join(";");
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

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
