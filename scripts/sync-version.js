import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const __dirname = new URL(".", import.meta.url).pathname;
const version = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8")).version;

// Sync src-tauri/tauri.conf.json
const tauriConfPath = resolve(__dirname, "../src-tauri/tauri.conf.json");
const tauriConf = readFileSync(tauriConfPath, "utf-8");
writeFileSync(tauriConfPath, tauriConf.replace(/"version": "[^"]+"/, `"version": "${version}"`));

// Sync src-tauri/Cargo.toml
const cargoPath = resolve(__dirname, "../src-tauri/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf-8");
writeFileSync(cargoPath, cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`));

console.log(`Synced version ${version} to tauri.conf.json and Cargo.toml`);
