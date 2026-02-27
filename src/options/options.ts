import { saveHandle } from "../db";

const selectBtn = document.getElementById("selectFolder")!;
const folderStatus = document.getElementById("folderStatus")!;
const imageFormatSelect = document.getElementById("imageFormat") as HTMLSelectElement;


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

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "vaultHandle",
    "imageFormat",
  ]);

  if (data.vaultHandle) {
    folderStatus.textContent = "Vault 폴더 선택 완료";
  }

  imageFormatSelect.value = data.imageFormat || "png";
}

loadSettings();