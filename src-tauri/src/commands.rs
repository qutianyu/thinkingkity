use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use encoding_rs::GBK;

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

fn resolve_path(raw: &str) -> Result<PathBuf, String> {
    // Reject empty paths and paths containing ".." segments before they reach the filesystem.
    let path = Path::new(raw);
    if raw.is_empty() {
        return Err("Path is empty.".to_string());
    }
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Path traversal is not allowed.".to_string());
        }
    }
    Ok(path.to_path_buf())
}

#[tauri::command]
pub fn read_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir = resolve_path(path)?;
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();
    let read = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in read {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        // Keep internal config folders out of normal vault browsing.
        if name.starts_with('.') {
            continue;
        }
        entries.push(FileEntry {
            path: entry.path().to_string_lossy().to_string(),
            name,
            is_dir: file_type.is_dir(),
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn read_file(path: &str) -> Result<String, String> {
    let resolved = resolve_path(path)?;
    let bytes = fs::read(&resolved).map_err(|e| e.to_string())?;

    // Prefer UTF-8, then fall back to GBK so existing Chinese text files remain readable.
    match String::from_utf8(bytes) {
        Ok(text) => Ok(text.trim_start_matches('\u{feff}').to_string()),
        Err(e) => {
            let bytes = e.into_bytes();
            let (text, _, _) = GBK.decode(&bytes);
            Ok(text.trim_start_matches('\u{feff}').to_string())
        }
    }
}

#[tauri::command]
pub fn read_file_base64(path: &str) -> Result<String, String> {
    let resolved = resolve_path(path)?;
    let bytes = fs::read(&resolved).map_err(|e| e.to_string())?;
    let mime = mime_guess::from_path(&resolved).first_or_octet_stream();
    let data_url = format!("data:{};base64,{}", mime, BASE64.encode(&bytes));
    Ok(data_url)
}

#[tauri::command]
pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    let resolved = resolve_path(path)?;
    // The frontend may create nested notes directly; make parent directories implicit.
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&resolved, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file(path: &str) -> Result<(), String> {
    let resolved = resolve_path(path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&resolved, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_folder(path: &str) -> Result<(), String> {
    let resolved = resolve_path(path)?;
    fs::create_dir_all(&resolved).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_file(source_path: &str, destination_path: &str) -> Result<(), String> {
    let source = resolve_path(source_path)?;
    let destination = resolve_path(destination_path)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&source, &destination)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_file(old_path: &str, new_path: &str) -> Result<(), String> {
    let old = resolve_path(old_path)?;
    let new = resolve_path(new_path)?;
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&old, &new).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_file(path: &str) -> Result<(), String> {
    let resolved = resolve_path(path)?;
    // Deleting folders is an explicit app operation, so remove their contents recursively.
    if resolved.is_dir() {
        fs::remove_dir_all(&resolved).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&resolved).map_err(|e| e.to_string())
    }
}

fn nearest_existing_parent(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return Ok(path.to_path_buf());
    }
    let mut current = path;
    while let Some(parent) = current.parent() {
        if parent.exists() {
            return Ok(parent.to_path_buf());
        }
        current = parent;
    }
    Err("No existing parent directory found.".to_string())
}

fn resolve_vault_relative_markdown_path(
    vault_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    if vault_path.trim().is_empty() || relative_path.trim().is_empty() {
        return Err("Path is empty.".to_string());
    }

    let vault = Path::new(vault_path)
        .canonicalize()
        .map_err(|e| format!("Invalid vault path: {}", e))?;
    if !vault.is_dir() {
        return Err("Vault path is not a directory.".to_string());
    }

    let rel = Path::new(relative_path);
    if rel.is_absolute() {
        return Err("Absolute paths are not allowed.".to_string());
    }

    for component in rel.components() {
        match component {
            std::path::Component::Normal(part) => {
                let text = part.to_string_lossy();
                if text.chars().any(|ch| ch.is_control()) {
                    return Err("Control characters are not allowed.".to_string());
                }
            }
            _ => return Err("Only normal relative path segments are allowed.".to_string()),
        }
    }

    if rel.components().next().and_then(|c| c.as_os_str().to_str()) == Some(".thinkingkity") {
        return Err("Writing internal vault metadata is not allowed.".to_string());
    }

    if rel.extension().and_then(|v| v.to_str()) != Some("md") {
        return Err("Only Markdown files can be written.".to_string());
    }

    let target = vault.join(rel);
    let parent = target.parent().ok_or_else(|| "Missing parent directory.".to_string())?;
    let existing_parent = nearest_existing_parent(parent)?;
    let canonical_parent = existing_parent
        .canonicalize()
        .map_err(|e| format!("Invalid parent directory: {}", e))?;

    if !canonical_parent.starts_with(&vault) {
        return Err("Target path must stay inside the vault.".to_string());
    }

    Ok(target)
}

#[tauri::command]
pub fn write_vault_markdown_file(
    vault_path: &str,
    relative_path: &str,
    content: &str,
) -> Result<String, String> {
    let target = resolve_vault_relative_markdown_path(vault_path, relative_path)?;
    if target.exists() {
        return Err("File already exists.".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

fn dir_size_recursive(path: &Path) -> u64 {
    let mut total: u64 = 0;
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else { continue };
        if file_type.is_dir() {
            total += dir_size_recursive(&entry.path());
        } else {
            total += entry.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    total
}

#[tauri::command]
pub fn get_vault_size(path: &str) -> Result<u64, String> {
    let dir = resolve_path(path)?;
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    Ok(dir_size_recursive(&dir))
}

fn validate_public_http_url(raw: &str) -> Result<String, String> {
    let lower = raw.trim().to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("Only http and https URLs are allowed.".to_string());
    }
    if lower.contains("://localhost")
        || lower.contains("://127.")
        || lower.contains("://0.")
        || lower.contains("://10.")
        || lower.contains("://192.168.")
        || lower.contains("://169.254.")
        || lower.contains("://[::1]")
    {
        return Err("Local and private network URLs are not allowed.".to_string());
    }
    Ok(raw.trim().to_string())
}

fn find_playwright_script() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let candidates = [
        cwd.join("scripts/playwright-browse.mjs"),
        cwd.join("../scripts/playwright-browse.mjs"),
        cwd.join("../../scripts/playwright-browse.mjs"),
    ];
    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "Playwright helper script was not found.".to_string())
}

#[tauri::command]
pub async fn browse_page_with_playwright(url: String, options: Option<String>) -> Result<String, String> {
    let safe_url = validate_public_http_url(&url)?;
    let script = find_playwright_script()?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new("node");
        command
            .arg(script)
            .arg(safe_url)
            .arg("15000");
        if let Some(options) = options {
            command.arg(options);
        }
        let output = command.output()
            .map_err(|e| format!("Failed to start Playwright helper: {}", e))?;

        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let message = if !stdout.trim().is_empty() { stdout } else { stderr };
            return Err(message.trim().to_string());
        }

        String::from_utf8(output.stdout).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Playwright helper task failed: {}", e))?
}
