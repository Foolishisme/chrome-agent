import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        "content-bridge": resolve(__dirname, "src/content/bridge.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        sidepanel: resolve(__dirname, "src/sidepanel/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
