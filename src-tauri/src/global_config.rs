use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_VAULTS: usize = 5;
const APP_DIR: &str = ".thinkingkity";
const VAULTS_SUBDIR: &str = "vaults";
const VAULTS_FILE: &str = "vaults.json";
const DEMO_VAULT_DIR: &str = "demo-vault";
const LEGACY_TEST_VAULT_DIR: &str = "test-vault";

include!("generated_demo_vault.rs");

#[derive(Debug, Serialize, Deserialize)]
struct VaultsData {
    #[serde(default)]
    allowed_paths: Vec<String>,
    vaults: Vec<String>,
}

// ── path helpers ──

fn get_global_config_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let userprofile = std::env::var("USERPROFILE")
            .map_err(|_| "USERPROFILE environment variable is not set.".to_string())?;
        Ok(PathBuf::from(userprofile).join(APP_DIR))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME")
            .map_err(|_| "HOME environment variable is not set.".to_string())?;
        Ok(PathBuf::from(home).join(APP_DIR))
    }
}

fn get_vaults_dir() -> Result<PathBuf, String> {
    Ok(get_global_config_dir()?.join(VAULTS_SUBDIR))
}

fn get_vaults_file_path() -> Result<PathBuf, String> {
    Ok(get_global_config_dir()?.join(VAULTS_FILE))
}

pub fn get_demo_vault_path() -> Result<PathBuf, String> {
    Ok(get_vaults_dir()?.join(DEMO_VAULT_DIR))
}

fn get_legacy_test_vault_path() -> Result<PathBuf, String> {
    Ok(get_vaults_dir()?.join(LEGACY_TEST_VAULT_DIR))
}

// ── vault list helpers ──

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

// ── file I/O ──

fn read_vaults_file() -> Result<VaultsData, String> {
    let file_path = get_vaults_file_path()?;
    match fs::read_to_string(&file_path) {
        Ok(raw) => {
            // Strip legacy "version" field if present.
            let mut value: serde_json::Value = serde_json::from_str(&raw)
                .map_err(|e| format!("Failed to parse vaults.json: {}", e))?;
            if let Some(obj) = value.as_object_mut() {
                obj.remove("version");
            }
            let data: VaultsData = serde_json::from_value(value)
                .map_err(|e| format!("Failed to parse vaults.json: {}", e))?;
            Ok(data)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(VaultsData {
            allowed_paths: Vec::new(),
            vaults: Vec::new(),
        }),
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

// ── allowed paths ──

pub fn get_allowed_paths() -> Result<Vec<String>, String> {
    let data = read_vaults_file()?;
    Ok(data.allowed_paths)
}

/// Check whether a given path is inside one of the allowed_paths entries
/// or is the demo vault directory.
pub fn is_path_allowed(target: &str) -> Result<bool, String> {
    // Canonicalize target if possible; fall back to simple normalization.
    let target_path = Path::new(target);
    let resolved = if target_path.exists() {
        target_path.canonicalize().map_err(|e| e.to_string())?
    } else {
        // Path doesn't exist yet (e.g. creating a new file). Use the target as-is.
        target_path.to_path_buf()
    };

    // Check demo vault.
    let demo = get_demo_vault_path()?;
    if demo.exists() {
        let demo_canonical = demo.canonicalize().map_err(|e| e.to_string())?;
        if resolved.starts_with(&demo_canonical) {
            return Ok(true);
        }
    }

    let data = read_vaults_file()?;
    for allowed in &data.allowed_paths {
        let allowed_path = Path::new(allowed);
        let allowed_canonical = if allowed_path.exists() {
            allowed_path.canonicalize().map_err(|e| e.to_string())?
        } else {
            // Keep the configured path even if the directory doesn't exist yet.
            allowed_path.to_path_buf()
        };
        if resolved.starts_with(&allowed_canonical) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Add a path to allowed_paths if not already present.
pub fn ensure_allowed_path(path: &str) -> Result<(), String> {
    let resolved = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path '{}': {}", path, e))?;
    let path_str = resolved.to_string_lossy().to_string();

    let mut data = read_vaults_file()?;
    let already = data.allowed_paths.iter().any(|p| {
        if let Ok(canon) = Path::new(p).canonicalize() {
            canon.to_string_lossy() == path_str.as_str()
        } else {
            false
        }
    });
    if !already {
        data.allowed_paths.push(path_str);
        data.allowed_paths = normalize_vaults(data.allowed_paths);
        write_vaults_file(&data)?;
    }
    Ok(())
}

// ── public commands ──

#[tauri::command]
pub fn read_global_vaults() -> Result<Vec<String>, String> {
    let data = read_vaults_file()?;
    Ok(normalize_vaults(data.vaults))
}

#[tauri::command]
pub fn write_global_vaults(vaults: Vec<String>) -> Result<(), String> {
    let mut data = read_vaults_file()?;
    data.vaults = normalize_vaults(vaults);
    write_vaults_file(&data)
}

/// Return the allowed_paths list. Used by the settings UI.
#[tauri::command]
pub fn read_allowed_paths() -> Result<Vec<String>, String> {
    get_allowed_paths()
}

/// Update the allowed_paths list.
#[tauri::command]
pub fn write_allowed_paths(paths: Vec<String>) -> Result<(), String> {
    let mut data = read_vaults_file()?;
    data.allowed_paths = normalize_vaults(paths);
    write_vaults_file(&data)
}

#[tauri::command]
pub fn ensure_allowed_path_cmd(path: String) -> Result<(), String> {
    ensure_allowed_path(&path)
}

#[tauri::command]
pub fn ensure_demo_vault() -> Result<String, String> {
    let demo_vault = get_demo_vault_path()?;
    let legacy_test_vault = get_legacy_test_vault_path()?;
    let legacy_path_str = legacy_test_vault.to_string_lossy().to_string();

    if demo_vault.is_dir() {
        let path_str = demo_vault.to_string_lossy().to_string();
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

    let mut data = read_vaults_file()?;
    data.vaults = normalize_vaults(
        std::iter::once(path_str.clone())
            .chain(data.vaults.clone())
            .filter(|p| p != &legacy_path_str)
            .collect(),
    );
    // Add the config dir (where demo-vault lives) to allowed_paths so
    // the user has a default workspace to create vaults in.
    if let Some(config_dir) = demo_vault.parent() {
        let config_str = config_dir.to_string_lossy().to_string();
        let already = data.allowed_paths.iter().any(|p| {
            Path::new(p).canonicalize().map(|c| c.to_string_lossy() == config_str).unwrap_or(false)
        });
        if !already {
            data.allowed_paths.push(config_str);
        }
    }
    write_vaults_file(&data)?;

    Ok(path_str)
}
