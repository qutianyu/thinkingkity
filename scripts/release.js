import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2);
const version = args.find((arg) => !arg.startsWith("-"));
const shouldPush = !args.includes("--no-push");

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: npm run release -- 0.5.1 [--no-push]");
  process.exit(1);
}

const tag = `v${version}`;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf-8",
    stdio: options.capture ? "pipe" : "inherit",
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf-8"));
}

function writeJson(path, value) {
  writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
}

function ensureCleanWorktree() {
  const status = run("git", ["status", "--porcelain"], { capture: true });
  if (status.trim()) {
    console.error("Git working directory is not clean. Commit or stash changes before releasing.");
    console.error(status);
    process.exit(1);
  }
}

function ensureTagAvailable() {
  try {
    run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { capture: true });
    console.error(`Tag ${tag} already exists locally.`);
    process.exit(1);
  } catch {
    // Missing tag is expected.
  }
}

function syncVersions() {
  const packageJson = readJson("package.json");
  packageJson.version = version;
  writeJson("package.json", packageJson);

  const packageLock = readJson("package-lock.json");
  packageLock.version = version;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = version;
  }
  writeJson("package-lock.json", packageLock);

  const tauriPath = resolve(root, "src-tauri/tauri.conf.json");
  const tauriConf = readFileSync(tauriPath, "utf-8");
  writeFileSync(tauriPath, tauriConf.replace(/"version": "[^"]+"/, `"version": "${version}"`));

  const cargoPath = resolve(root, "src-tauri/Cargo.toml");
  const cargoToml = readFileSync(cargoPath, "utf-8");
  writeFileSync(cargoPath, cargoToml.replace(/^version = "[^"]+"/m, `version = "${version}"`));
}

function hasStagedChanges() {
  try {
    run("git", ["diff", "--cached", "--quiet"], { capture: true });
    return false;
  } catch {
    return true;
  }
}

ensureCleanWorktree();
ensureTagAvailable();

syncVersions();

run("git", [
  "add",
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
]);

if (hasStagedChanges()) {
  run("git", ["commit", "-m", `Release ${tag}`]);
} else {
  console.log(`Version files are already ${version}; tagging current commit.`);
}

run("git", ["tag", tag]);

if (shouldPush) {
  run("git", ["push", "origin", "HEAD"]);
  run("git", ["push", "origin", tag]);
} else {
  console.log(`Created ${tag} locally. Push with: git push origin HEAD && git push origin ${tag}`);
}
