import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

const pdfjsAssetDirs = ["cmaps", "iccs", "standard_fonts", "wasm"];
const appVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8")).version;
const appPlatform = process.env.THINKINGKITY_UPDATE_PLATFORM ?? {
  darwin: "macos",
  win32: "windows",
  linux: "linux",
}[process.platform] ?? process.platform;
const appArch = process.env.THINKINGKITY_UPDATE_ARCH ?? {
  arm64: "aarch64",
  x64: "x86_64",
}[process.arch] ?? process.arch;

function pdfjsAssetsPlugin() {
  const pdfjsRoot = path.resolve(__dirname, "node_modules/pdfjs-dist");
  const publicPrefix = "/pdfjs/";

  return {
    name: "thinkingkity-pdfjs-assets",
    configureServer(server) {
      server.middlewares.use(publicPrefix, (req, res, next) => {
        const requestPath = decodeURIComponent(req.url?.split("?")[0] ?? "");
        const assetPath = path.normalize(path.join(pdfjsRoot, requestPath));
        if (!assetPath.startsWith(pdfjsRoot + path.sep)) {
          next();
          return;
        }
        fs.createReadStream(assetPath)
          .on("error", next)
          .pipe(res);
      });
    },
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist/pdfjs");
      fs.mkdirSync(outDir, { recursive: true });
      for (const dir of pdfjsAssetDirs) {
        fs.cpSync(path.join(pdfjsRoot, dir), path.join(outDir, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssetsPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_PLATFORM__: JSON.stringify(appPlatform),
    __APP_ARCH__: JSON.stringify(appArch),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.THINKINGKITY_PORT || "19840"}`,
        changeOrigin: true,
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
});
