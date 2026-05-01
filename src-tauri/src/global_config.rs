use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const MAX_VAULTS: usize = 5;
const APP_DIR: &str = "thinkingkity";
const VAULTS_FILE: &str = "vaults.json";
const TEST_VAULT_DIR: &str = "test-vault";

/// Test vault files embedded at compile time. Each entry is (relative_path, content).
/// relative_path is relative to the test-vault root, e.g. "notes/getting-started.md".
type TestFile = (&'static str, &'static str);

fn test_vault_files() -> Vec<TestFile> {
    vec![
        ("README.md", include_str!("../../test-vault/README.md")),
        // notes
        ("notes/getting-started.md", include_str!("../../test-vault/notes/getting-started.md")),
        ("notes/todo.md", include_str!("../../test-vault/notes/todo.md")),
        ("notes/cheatsheet.md", include_str!("../../test-vault/notes/cheatsheet.md")),
        // code - languages
        ("code/hello.py", include_str!("../../test-vault/code/hello.py")),
        ("code/app.ts", include_str!("../../test-vault/code/app.ts")),
        ("code/hello.java", include_str!("../../test-vault/code/hello.java")),
        ("code/hello.rs", include_str!("../../test-vault/code/hello.rs")),
        ("code/hello.go", include_str!("../../test-vault/code/hello.go")),
        ("code/main.c", include_str!("../../test-vault/code/main.c")),
        ("code/utils.js", include_str!("../../test-vault/code/utils.js")),
        ("code/style.css", include_str!("../../test-vault/code/style.css")),
        ("code/queries.sql", include_str!("../../test-vault/code/queries.sql")),
        ("code/deploy.sh", include_str!("../../test-vault/code/deploy.sh")),
        // code - web
        ("code/web/App.tsx", include_str!("../../test-vault/code/web/App.tsx")),
        ("code/web/index.html", include_str!("../../test-vault/code/web/index.html")),
        ("code/web/data.xml", include_str!("../../test-vault/code/web/data.xml")),
        // data
        ("data/sample.csv", include_str!("../../test-vault/data/sample.csv")),
        ("data/config.json", include_str!("../../test-vault/data/config.json")),
        ("data/config.yaml", include_str!("../../test-vault/data/config.yaml")),
        ("data/config.toml", include_str!("../../test-vault/data/config.toml")),
        // text
        ("text/plain.txt", include_str!("../../test-vault/text/plain.txt")),
    ]
}

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

fn get_test_vault_path() -> Result<PathBuf, String> {
    Ok(get_global_config_dir()?.join(TEST_VAULT_DIR))
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
pub fn ensure_test_vault() -> Result<String, String> {
    let test_vault = get_test_vault_path()?;

    // If the directory already exists, don't overwrite user changes.
    if test_vault.is_dir() {
        let path_str = test_vault.to_string_lossy().to_string();
        // Still ensure it's in vaults.json.
        let mut data = read_vaults_file()?;
        data.vaults = normalize_vaults(
            std::iter::once(path_str.clone())
                .chain(data.vaults.clone())
                .collect(),
        );
        write_vaults_file(&data)?;
        return Ok(path_str);
    }

    fs::create_dir_all(&test_vault)
        .map_err(|e| format!("Failed to create test vault dir: {}", e))?;

    for (relative_path, content) in test_vault_files() {
        let dest = test_vault.join(relative_path);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent dir: {}", e))?;
        }
        fs::write(&dest, content)
            .map_err(|e| format!("Failed to write {}: {}", relative_path, e))?;
    }

    let path_str = test_vault.to_string_lossy().to_string();

    // Add test vault to the front of the vaults list.
    let mut data = read_vaults_file()?;
    data.vaults = normalize_vaults(
        std::iter::once(path_str.clone())
            .chain(data.vaults.clone())
            .collect(),
    );
    write_vaults_file(&data)?;

    Ok(path_str)
}
