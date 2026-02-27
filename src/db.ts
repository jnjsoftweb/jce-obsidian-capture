const DB_NAME = "vaultDB";
const STORE_NAME = "handles";

export async function saveHandle(handle: FileSystemDirectoryHandle) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(handle, "vault");
  await tx.done;
}

export async function getHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const handle = await tx.objectStore(STORE_NAME).get("vault");
  return handle || null;
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}