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

  // ✅ 설정 열기 버튼 수정
  openOptionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  captureBtn.addEventListener("click", async () => {
    try {
      statusText.textContent = "캡처 중...";

      const { imageFormat } =
        await chrome.storage.local.get("imageFormat");

      const format =
        imageFormat || "png";

      // 1️⃣ Background에서 캡처
      const response =
        await chrome.runtime.sendMessage({
          type: "CAPTURE_VISIBLE",
          format,
        });

      if (!response?.dataUrl) {
        statusText.textContent = "캡처 실패";
        return;
      }

      // 🔥 2️⃣ 사용자에게 직접 폴더 선택 요청
      const vaultHandle =
        await window.showDirectoryPicker();

      await saveToVault(
        vaultHandle,
        response.dataUrl,
        format
      );

      statusText.textContent = "저장 완료!";
    } catch (err) {
      console.error("Popup error:", err);
      statusText.textContent = "오류 발생";
    }
  });
});

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