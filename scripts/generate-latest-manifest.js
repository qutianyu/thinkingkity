import { readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const artifactsDir = process.argv[2];
const outputPath = process.argv[3];
const tag = process.env.GITHUB_REF_NAME;
const repo = process.env.GITHUB_REPOSITORY;

if (!artifactsDir || !outputPath || !tag || !repo) {
  console.error("Usage: GITHUB_REPOSITORY=owner/repo GITHUB_REF_NAME=vX.Y.Z node scripts/generate-latest-manifest.js <artifacts-dir> <output-path>");
  process.exit(1);
}

function collectFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function packageFrom(files, predicate) {
  const path = files.find((file) => predicate(basename(file).toLowerCase()));
  if (!path) return null;
  const name = basename(path);
  return {
    name,
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,
  };
}

const files = collectFiles(artifactsDir);
const manifest = {
  version: tag,
  url: `https://github.com/${repo}/releases/tag/${tag}`,
  packages: {
    macos: packageFrom(files, (name) => name.endsWith(".dmg")),
    windows: packageFrom(files, (name) => name.endsWith(".msi"))
      ?? packageFrom(files, (name) => name.endsWith(".exe") && name !== "thinkingkity.exe"),
    linux: packageFrom(files, (name) => name.endsWith(".appimage") || name.endsWith(".deb")),
    android: null,
  },
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
