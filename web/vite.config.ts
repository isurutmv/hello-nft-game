import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devApi } from "./server/devApi";

export default defineConfig({
  plugins: [react(), devApi()],
  build: {
    rollupOptions: {
      // the app, plus the standalone NFT page used for wallet images and animation_url
      input: { main: "index.html", card: "card.html" },
    },
  },
});
