import { chooseDirectory } from "../fs";

const btn = document.getElementById("chooseVault")!;
const status = document.getElementById("vaultStatus")!;

btn.addEventListener("click", async () => {
  await chooseDirectory();
  const result = await chrome.storage.local.get("vaultName");

  status.textContent = `Selected: ${result.vaultName}`;
});

window.addEventListener("DOMContentLoaded", async () => {
  const result = await chrome.storage.local.get("vaultName");
  if (result.vaultName) {
    status.textContent = `Selected: ${result.vaultName}`;
  }
});