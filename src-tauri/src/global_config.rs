use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const MAX_VAULTS: usize = 5;
const APP_DIR: &str = "thinkingkity";
const VAULTS_FILE: &str = "vaults.json";
const DEMO_VAULT_DIR: &str = "demo-vault";
const LEGACY_TEST_VAULT_DIR: &str = "test-vault";

include!("generated_demo_vault.rs");

#[derive(Debug, Serialize, Deserialize)]
struct VaultsData {
    version: u32,
    vaults: Vec<String>,
}

fn get_global_config_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA")
            .map_err(|_| "APPDATA environment variable is not set.".to_string())?;
        Ok(PathBuf::from(appdata).join(APP_DIR))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let base = std::env::var("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .ok()
            .or_else(|| {
                std::env::var("HOME")
                    .map(|home| PathBuf::from(home).join(".config"))
                    .ok()
            })
            .ok_or_else(|| "HOME environment variable is not set.".to_string())?;
        Ok(base.join(APP_DIR))
    }
}

fn get_vaults_file_path() -> Result<PathBuf, String> {
    Ok(get_global_config_dir()?.join(VAULTS_FILE))
}

fn get_demo_vault_path() -> Result<PathBuf, String> {
    Ok(get_global_config_dir()?.join(DEMO_VAULT_DIR))
}

fn get_legacy_test_vault_path() -> Result<PathBuf, String> {
    Ok(get_global_config_dir()?.join(LEGACY_TEST_VAULT_DIR))
}

fn normalize_vaults(raw: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for path in raw {
        let trimmed = path.trim().to_string();
        if trimmed.is_empty() || !seen.insert(trimmed.clone()) {
            continue;
        }
        result.push(trimmed);
        if result.len() >= MAX_VAULTS {
            break;
        }
    }
    result
}

fn read_vaults_file() -> Result<VaultsData, String> {
    let file_path = get_vaults_file_path()?;
    match fs::read_to_string(&file_path) {
        Ok(raw) => {
            let data: VaultsData = serde_json::from_str(&raw)
                .map_err(|e| format!("Failed to parse vaults.json: {}", e))?;
            Ok(data)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(VaultsData { version: 1, vaults: Vec::new() })
        }
        Err(e) => Err(format!("Failed to read vaults.json: {}", e)),
    }
}

fn write_vaults_file(data: &VaultsData) -> Result<(), String> {
    let file_path = get_vaults_file_path()?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize vaults: {}", e))?;
    fs::write(&file_path, json).map_err(|e| format!("Failed to write vaults.json: {}", e))
}

// ── public commands ──

#[tauri::command]
pub fn read_global_vaults() -> Result<Vec<String>, String> {
    let data = read_vaults_file()?;
    Ok(normalize_vaults(data.vaults))
}

#[tauri::command]
pub fn write_global_vaults(vaults: Vec<String>) -> Result<(), String> {
    let data = VaultsData {
        version: 1,
        vaults: normalize_vaults(vaults),
    };
    write_vaults_file(&data)
}

#[tauri::command]
pub fn ensure_demo_vault() -> Result<String, String> {
    let demo_vault = get_demo_vault_path()?;
    let legacy_test_vault = get_legacy_test_vault_path()?;
    let legacy_path_str = legacy_test_vault.to_string_lossy().to_string();

    // If the directory already exists, don't overwrite user changes.
    if demo_vault.is_dir() {
        let path_str = demo_vault.to_string_lossy().to_string();
        // Still ensure it's in vaults.json.
        let mut data = read_vaults_file()?;
        data.vaults = normalize_vaults(
            std::iter::once(path_str.clone())
                .chain(data.vaults.clone())
                .filter(|p| p != &legacy_path_str)
                .collect(),
        );
        write_vaults_file(&data)?;
        return Ok(path_str);
    }

    fs::create_dir_all(&demo_vault)
        .map_err(|e| format!("Failed to create demo vault dir: {}", e))?;

    for (relative_path, content) in demo_vault_files() {
        let dest = demo_vault.join(relative_path);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent dir: {}", e))?;
        }
        fs::write(&dest, content)
            .map_err(|e| format!("Failed to write {}: {}", relative_path, e))?;
    }

    let path_str = demo_vault.to_string_lossy().to_string();

    // Add demo vault to the front of the vaults list and remove the old bundled demo-vault entry.
    let mut data = read_vaults_file()?;
    data.vaults = normalize_vaults(
        std::iter::once(path_str.clone())
            .chain(data.vaults.clone())
            .filter(|p| p != &legacy_path_str)
            .collect(),
    );
    write_vaults_file(&data)?;

    Ok(path_str)
}
