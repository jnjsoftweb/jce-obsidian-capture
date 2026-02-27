import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        // offscreen document는 manifest에 선언하지 않으므로 별도 entry로 추가
        offscreen: "src/offscreen/offscreen.html",
      },
    },
  },
});