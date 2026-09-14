import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    react(),
    // pdf.js loads these lazily at runtime (fonts, CMaps, image decoders,
    // annotation icons), so they must be served as plain static files.
    viteStaticCopy({
      targets: [
        { src: "node_modules/pdfjs-dist/cmaps/**", dest: "pdfjs", rename: { stripBase: 2 } },
        { src: "node_modules/pdfjs-dist/standard_fonts/**", dest: "pdfjs", rename: { stripBase: 2 } },
        { src: "node_modules/pdfjs-dist/wasm/**", dest: "pdfjs", rename: { stripBase: 2 } },
        { src: "node_modules/pdfjs-dist/iccs/**", dest: "pdfjs", rename: { stripBase: 2 } },
        { src: "node_modules/pdfjs-dist/web/images/**", dest: "pdfjs", rename: { stripBase: 3 } },
      ],
    }),
  ],
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 4000,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
