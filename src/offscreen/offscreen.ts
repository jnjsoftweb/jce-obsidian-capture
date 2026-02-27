// offscreen.ts
// MV3 서비스 워커는 File System Access API를 사용할 수 없으므로,
// DOM 컨텍스트를 가진 Offscreen Document에서 vault 저장을 처리합니다.

import { getHandle } from "../db";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;

  if (msg.type === "SAVE_SCROLL_CAPTURE") {
    const format: string = msg.format || "png";
    const subFolder: string = msg.subFolder || "";
    const dataUrls: string[] = msg.dataUrls;
    saveToVault(dataUrls, format, subFolder)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        const errStr = String(err);
        if (
          errStr.includes("NO_VAULT") ||
          errStr.includes("PERMISSION_DENIED") ||
          errStr.includes("NotAllowedError")
        ) {
          sendResponse({ noVault: true });
        } else {
          sendResponse({ error: errStr });
        }
      });
    return true;
  }
});

async function saveToVault(
  dataUrls: string[],
  format: string,
  subFolder: string
): Promise<void> {
  const vaultHandle = await getHandle();
  if (!vaultHandle) {
    throw new Error("NO_VAULT");
  }

  const perm = await vaultHandle.queryPermission({ mode: "readwrite" });
  if (perm !== "granted") {
    throw new Error("PERMISSION_DENIED");
  }

  const now = new Date();
  const ext = format === "jpeg" ? "jpg" : format;
  const timestamp = now.toISOString().replace(/[:.]/g, "-");

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

  const total = dataUrls.length;
  for (let i = 0; i < total; i++) {
    // fetch 대신 atob 기반 변환: 대용량 data URL에서 fetch 실패를 방지
    const blob = dataUrlToBlob(dataUrls[i]);
    if (blob.size === 0) {
      throw new Error("EMPTY_BLOB: data URL produced an empty blob");
    }

    // 단일 파일이면 suffix 없음, 분할이면 -part1, -part2 ...
    const suffix = total > 1 ? `-part${i + 1}` : "";
    const fileName = `scroll-${timestamp}${suffix}.${ext}`;

    // 파일 생성 후 write 실패 시 0바이트 파일이 남지 않도록 abort + 삭제 처리
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
}

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
