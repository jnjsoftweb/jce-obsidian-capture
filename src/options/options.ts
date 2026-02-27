import { saveHandle } from "../db";

const selectBtn = document.getElementById("selectFolder")!;
const folderStatus = document.getElementById("folderStatus")!;
const vaultNameSpan = document.getElementById("vaultName")!;
const imageFormatSelect = document.getElementById("imageFormat") as HTMLSelectElement;
const useScrollCheckbox = document.getElementById("useScroll") as HTMLInputElement;
const subFolderInput = document.getElementById("subFolder") as HTMLInputElement;

selectBtn.addEventListener("click", async () => {
  let dirHandle: FileSystemDirectoryHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  } catch {
    return; // 사용자 취소
  }

  await saveHandle(dirHandle);
  await chrome.storage.local.set({ vaultName: dirHandle.name });

  folderStatus.firstChild!.textContent = "선택된 Vault — ";
  vaultNameSpan.textContent = `📁 ${dirHandle.name}`;
});

subFolderInput.addEventListener("change", async () => {
  await chrome.storage.local.set({ vaultSubFolder: subFolderInput.value.trim() });
});

imageFormatSelect.addEventListener("change", async () => {
  await chrome.storage.local.set({
    imageFormat: imageFormatSelect.value,
  });
});

useScrollCheckbox.addEventListener("change", async () => {
  await chrome.storage.local.set({
    useScroll: useScrollCheckbox.checked,
  });
});

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "vaultName",
    "vaultSubFolder",
    "imageFormat",
    "useScroll",
  ]);

  if (data.vaultName) {
    folderStatus.firstChild!.textContent = "선택된 Vault — ";
    vaultNameSpan.textContent = `📁 ${data.vaultName}`;
  }

  subFolderInput.value = data.vaultSubFolder || "";
  imageFormatSelect.value = data.imageFormat || "png";
  useScrollCheckbox.checked = data.useScroll !== false; // 기본값 true
}

loadSettings();
