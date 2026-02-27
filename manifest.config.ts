import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Full Page Obsidian Capture",
  version: "1.0.0",

  permissions: [
    "activeTab",
    "downloads",
    // "scripting",
    "storage"
  ],

  host_permissions: ["<all_urls>"],

  background: {
    service_worker: "src/background.ts",
    type: "module",
  },

  action: {
    default_popup: "src/popup/popup.html",
  },

  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/contentScript.ts"],
    },
  ],

  options_page: "src/options/options.html",

  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
});