import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const targets = [
  "dist",
  "src-tauri/target",
  "thinkingkity-server",
];

for (const target of targets) {
  const absolute = path.resolve(root, target);
  if (!absolute.startsWith(root + path.sep)) {
    throw new Error(`Refusing to remove path outside project: ${target}`);
  }
  if (!fs.existsSync(absolute)) {
    console.log(`skip ${target}`);
    continue;
  }
  fs.rmSync(absolute, { recursive: true, force: true });
  console.log(`removed ${target}`);
}
