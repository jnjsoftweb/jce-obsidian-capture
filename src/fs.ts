let dirHandle: FileSystemDirectoryHandle | null = null;

export async function chooseDirectory() {
  dirHandle = await window.showDirectoryPicker();
  await chrome.storage.local.set({
    vaultName: dirHandle.name,
  });
}

export async function saveToVault(dataUrl: string, fileName: string) {
  if (!dirHandle) throw new Error("Vault not selected");

  const fileHandle = await dirHandle.getFileHandle(fileName, {
    create: true,
  });

  const writable = await fileHandle.createWritable();
  const blob = await (await fetch(dataUrl)).blob();
  await writable.write(blob);
  await writable.close();
}