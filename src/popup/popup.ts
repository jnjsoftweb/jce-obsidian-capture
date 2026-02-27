document.addEventListener("DOMContentLoaded", () => {
  const captureBtn = document.getElementById(
    "captureBtn"
  ) as HTMLButtonElement;

  const openOptionsBtn = document.getElementById(
    "openOptions"
  ) as HTMLButtonElement;

  const statusText = document.getElementById(
    "status"
  ) as HTMLParagraphElement;

  if (!captureBtn || !statusText || !openOptionsBtn) {
    console.error("Popup elements not found.");
    return;
  }

  openOptionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  captureBtn.addEventListener("click", async () => {
    try {
      statusText.textContent = "캡처 중...";

      const data = await chrome.storage.local.get([
        "imageFormat",
        "useScroll",
      ]);

      const format: "png" | "jpeg" | "webp" =
        data.imageFormat || "png";
      const useScroll: boolean = data.useScroll !== false; // 기본값 true

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

      const vaultHandle = await window.showDirectoryPicker();
      await saveToVault(vaultHandle, dataUrl, format);

      statusText.textContent = "저장 완료!";
    } catch (err) {
      console.error("Popup error:", err);
      statusText.textContent = "오류 발생";
    }
  });
});

/**
 * 스크롤을 이용해 전체 페이지를 캡처하고 하나의 이미지로 합칩니다.
 * chrome.scripting.executeScript를 사용해 콘텐츠 스크립트 주입 여부에 무관하게 동작합니다.
 */
async function captureFullPage(
  format: "png" | "jpeg" | "webp"
): Promise<string> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) throw new Error("No active tab");

  // 페이지 크기 정보 + devicePixelRatio 가져오기
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

  // 캔버스는 물리 픽셀 기준으로 생성 (dpr 적용)
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewportWidth * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  const ctx = canvas.getContext("2d")!;

  let scrollY = 0;

  while (scrollY < totalHeight) {
    // 브라우저가 실제로 스크롤할 수 있는 최대 y 값 (음수 방지)
    const actualScrollY = Math.max(
      0,
      Math.min(scrollY, totalHeight - viewportHeight)
    );

    // 스크롤 이동
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (y: number) => { window.scrollTo(0, y); },
      args: [actualScrollY],
    });

    // 렌더링 대기 (느린 페이지 대응)
    await delay(300);

    // 현재 화면 캡처
    const response = await chrome.runtime.sendMessage({
      type: "CAPTURE_VISIBLE",
      format,
    });

    if (!response?.dataUrl) throw new Error("Capture failed");

    const img = await loadImage(response.dataUrl);

    // CSS 픽셀 기준 오프셋·높이 계산
    const srcY_css = scrollY - actualScrollY;
    const drawHeight_css = Math.min(
      viewportHeight - srcY_css,
      totalHeight - scrollY
    );

    // 물리 픽셀로 변환하여 drawImage
    // → 스크린샷(img)은 물리 픽셀(CSS px × dpr) 크기이므로
    //   소스 좌표도 반드시 물리 픽셀로 지정해야 올바른 영역이 샘플링됨
    const pSrcY   = Math.round(srcY_css      * dpr);
    const pDestY  = Math.round(scrollY        * dpr);
    const pWidth  = Math.round(viewportWidth  * dpr);
    const pH      = Math.round(drawHeight_css * dpr);

    ctx.drawImage(
      img,
      0, pSrcY, pWidth, pH,   // 소스: 물리 픽셀
      0, pDestY, pWidth, pH   // 대상: 물리 픽셀
    );

    scrollY += viewportHeight - srcY_css;
  }

  // 스크롤 원위치
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

async function saveToVault(
  vaultHandle: FileSystemDirectoryHandle,
  dataUrl: string,
  format: string
) {
  const blob = await (await fetch(dataUrl)).blob();

  const now = new Date();

  const monthFolder = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

  const webCapturesDir =
    await vaultHandle.getDirectoryHandle(
      "WebCaptures",
      { create: true }
    );

  const monthDir =
    await webCapturesDir.getDirectoryHandle(
      monthFolder,
      { create: true }
    );

  const extension =
    format === "jpeg" ? "jpg" : format;

  const fileName = `capture-${now
    .toISOString()
    .replace(/[:.]/g, "-")}.${extension}`;

  const fileHandle =
    await monthDir.getFileHandle(fileName, {
      create: true,
    });

  const writable =
    await fileHandle.createWritable();

  await writable.write(blob);
  await writable.close();
}
