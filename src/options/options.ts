import { saveHandle } from "../db";

const selectBtn = document.getElementById("selectFolder")!;
const folderStatus = document.getElementById("folderStatus")!;
const imageFormatSelect = document.getElementById("imageFormat") as HTMLSelectElement;
const useScrollCheckbox = document.getElementById("useScroll") as HTMLInputElement;


selectBtn.addEventListener("click", async () => {
  const dirHandle = await window.showDirectoryPicker();
  await saveHandle(dirHandle);

  folderStatus.textContent = "Vault 폴더 선택 완료";
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
    "vaultHandle",
    "imageFormat",
    "useScroll",
  ]);

  if (data.vaultHandle) {
    folderStatus.textContent = "Vault 폴더 선택 완료";
  }

  imageFormatSelect.value = data.imageFormat || "png";
  useScrollCheckbox.checked = data.useScroll !== false; // 기본값 true
}

loadSettings();