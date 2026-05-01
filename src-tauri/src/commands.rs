use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
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
