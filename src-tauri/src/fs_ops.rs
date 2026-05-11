use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use encoding_rs::GBK;

use crate::global_config;

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

// ── path safety ──

pub fn resolve_path(raw: &str) -> Result<PathBuf, String> {
    if raw.trim().is_empty() {
        return Err("Path is empty.".to_string());
    }
    let path = Path::new(raw);
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Path traversal is not allowed.".to_string());
        }
    }
    Ok(path.to_path_buf())
}

/// Validate that the target path is inside allowed_paths or is the demo vault.
pub fn check_path_allowed(raw: &str) -> Result<PathBuf, String> {
    let resolved = resolve_path(raw)?;
    let allowed = global_config::is_path_allowed(&resolved.to_string_lossy())?;
    if !allowed {
        return Err(format!(
            "Access denied: '{}' is not in allowed paths.",
            raw
        ));
    }
    Ok(resolved)
}

// ── file CRUD ──

pub fn read_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir = check_path_allowed(path)?;
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();
    let read = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in read {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
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

pub fn read_file(path: &str) -> Result<String, String> {
    let resolved = check_path_allowed(path)?;
    let bytes = fs::read(&resolved).map_err(|e| e.to_string())?;

    match String::from_utf8(bytes) {
        Ok(text) => Ok(text.trim_start_matches('\u{feff}').to_string()),
        Err(e) => {
            let bytes = e.into_bytes();
            let (text, _, _) = GBK.decode(&bytes);
            Ok(text.trim_start_matches('\u{feff}').to_string())
        }
    }
}

pub fn read_file_base64(path: &str) -> Result<String, String> {
    let resolved = check_path_allowed(path)?;
    let bytes = fs::read(&resolved).map_err(|e| e.to_string())?;
    let mime = mime_guess::from_path(&resolved).first_or_octet_stream();
    let data_url = format!("data:{};base64,{}", mime, BASE64.encode(&bytes));
    Ok(data_url)
}

pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    let resolved = check_path_allowed(path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&resolved, content).map_err(|e| e.to_string())
}

pub fn write_file_base64(path: &str, data_url: &str) -> Result<(), String> {
    let resolved = check_path_allowed(path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let base64_data = if let Some(idx) = data_url.find(";base64,") {
        &data_url[idx + 8..]
    } else {
        data_url
    };
    let bytes = BASE64.decode(base64_data).map_err(|e| format!("Invalid base64: {}", e))?;
    fs::write(&resolved, bytes).map_err(|e| e.to_string())
}

pub fn create_file(path: &str) -> Result<(), String> {
    let resolved = check_path_allowed(path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&resolved, "").map_err(|e| e.to_string())
}

pub fn create_folder(path: &str) -> Result<(), String> {
    let resolved = check_path_allowed(path)?;
    fs::create_dir_all(&resolved).map_err(|e| e.to_string())
}

pub fn copy_file(source_path: &str, destination_path: &str) -> Result<(), String> {
    let source = check_path_allowed(source_path)?;
    let destination = check_path_allowed(destination_path)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&source, &destination)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn rename_file(old_path: &str, new_path: &str) -> Result<(), String> {
    let old = check_path_allowed(old_path)?;
    let new = check_path_allowed(new_path)?;
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&old, &new).map_err(|e| e.to_string())
}

pub fn delete_file(path: &str) -> Result<(), String> {
    let resolved = check_path_allowed(path)?;
    if resolved.is_dir() {
        fs::remove_dir_all(&resolved).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&resolved).map_err(|e| e.to_string())
    }
}

pub fn get_vault_size(path: &str) -> Result<u64, String> {
    let dir = check_path_allowed(path)?;
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    Ok(dir_size_recursive(&dir))
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

// ── recovery center ──

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotEntry {
    pub id: String,
    pub file_path: String,
    pub snapshot_path: String,
    pub created_at: String,
    pub size: u64,
    pub reason: String,
    pub content_hash: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub id: String,
    pub original_path: String,
    pub trash_path: String,
    pub deleted_at: String,
    pub size: u64,
    pub is_directory: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RecoveryIndex {
    snapshots: Vec<SnapshotEntry>,
    trash: Vec<TrashEntry>,
}

const MAX_SNAPSHOTS_PER_FILE: usize = 30;
const TEXT_SNAPSHOT_EXTENSIONS: &[&str] = &[
    "md", "markdown", "txt", "json", "yaml", "yml", "toml", "ini", "properties", "csv",
    "mermaid", "js", "jsx", "ts", "tsx", "py", "java", "rs", "go", "c", "cpp", "h", "hpp",
    "cs", "rb", "lua", "r", "groovy", "sh", "bash", "zsh", "css", "scss", "sass", "less",
    "html", "xml", "vue", "log",
];

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn now_stamp() -> String {
    now_millis().to_string()
}

fn stable_hash<T: Hash>(value: T) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn recovery_dir(vault: &Path) -> PathBuf {
    vault.join(".thinkingkity").join("recovery")
}

fn recovery_index_path(vault: &Path) -> PathBuf {
    recovery_dir(vault).join("index.json")
}

fn ensure_vault(vault_path: &str) -> Result<PathBuf, String> {
    let vault = check_path_allowed(vault_path)?;
    let vault = vault
        .canonicalize()
        .map_err(|e| format!("Invalid vault path: {}", e))?;
    if !vault.is_dir() {
        return Err("Vault path is not a directory.".to_string());
    }
    Ok(vault)
}

fn path_inside_vault(vault: &Path, raw: &str) -> Result<PathBuf, String> {
    let path = check_path_allowed(raw)?;
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    if !canonical.starts_with(vault) {
        return Err("Path must stay inside the vault.".to_string());
    }
    if canonical.starts_with(vault.join(".thinkingkity")) {
        return Err("Recovery does not operate on internal vault metadata.".to_string());
    }
    Ok(canonical)
}

fn relative_to_vault(vault: &Path, path: &Path) -> Result<String, String> {
    let rel = path
        .strip_prefix(vault)
        .map_err(|_| "Path must stay inside the vault.".to_string())?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

fn is_text_snapshot_candidate(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| TEXT_SNAPSHOT_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn read_recovery_index(vault: &Path) -> RecoveryIndex {
    let path = recovery_index_path(vault);
    let Ok(raw) = fs::read_to_string(path) else {
        return RecoveryIndex::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_recovery_index(vault: &Path, index: &RecoveryIndex) -> Result<(), String> {
    let path = recovery_index_path(vault);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn copy_dir_recursive(source: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let target = dest.join(entry.file_name());
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn unique_existing_target(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let parent = path.parent().unwrap_or_else(|| Path::new(""));
    let stem = path.file_stem().and_then(|v| v.to_str()).unwrap_or("restored");
    let ext = path.extension().and_then(|v| v.to_str()).unwrap_or("");
    for index in 1..1000 {
        let name = if ext.is_empty() {
            format!("{}.restored-{}", stem, index)
        } else {
            format!("{}.restored-{}.{}", stem, index, ext)
        };
        let candidate = parent.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{}.restored-{}", stem, now_stamp()))
}

fn cleanup_snapshots_for_file(vault: &Path, index: &mut RecoveryIndex, file_path: &str) {
    let mut entries: Vec<_> = index
        .snapshots
        .iter()
        .filter(|entry| entry.file_path == file_path)
        .cloned()
        .collect();
    entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    for old in entries.into_iter().skip(MAX_SNAPSHOTS_PER_FILE) {
        let _ = fs::remove_file(vault.join(&old.snapshot_path));
        index.snapshots.retain(|entry| entry.id != old.id);
    }
}

fn delete_snapshots_after(
    vault: &Path,
    index: &mut RecoveryIndex,
    file_path: &str,
    created_at: &str,
) {
    let stale_ids: Vec<String> = index
        .snapshots
        .iter()
        .filter(|entry| entry.file_path == file_path && entry.created_at.as_str() > created_at)
        .map(|entry| {
            let _ = fs::remove_file(vault.join(&entry.snapshot_path));
            entry.id.clone()
        })
        .collect();
    index
        .snapshots
        .retain(|entry| !stale_ids.iter().any(|id| id == &entry.id));
}

pub fn create_snapshot(
    vault_path: &str,
    file_path: &str,
    reason: &str,
) -> Result<Option<SnapshotEntry>, String> {
    let vault = ensure_vault(vault_path)?;
    let target = path_inside_vault(&vault, file_path)?;
    if !target.is_file() || !is_text_snapshot_candidate(&target) {
        return Ok(None);
    }

    let bytes = fs::read(&target).map_err(|e| e.to_string())?;
    let content_hash = stable_hash(&bytes);
    let relative = relative_to_vault(&vault, &target)?;
    let mut index = read_recovery_index(&vault);
    if index
        .snapshots
        .iter()
        .any(|entry| entry.file_path == relative && entry.content_hash == content_hash)
    {
        return Ok(None);
    }

    let file_id = stable_hash(&relative);
    let stamp = now_stamp();
    let ext = target.extension().and_then(|v| v.to_str()).unwrap_or("txt");
    let id = format!("{}-{}", file_id, stamp);
    let snapshot_rel = format!(
        ".thinkingkity/recovery/snapshots/{}/{}.{}",
        file_id, stamp, ext
    );
    let snapshot_abs = vault.join(&snapshot_rel);
    if let Some(parent) = snapshot_abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = fs::File::create(&snapshot_abs).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    let entry = SnapshotEntry {
        id,
        file_path: relative.clone(),
        snapshot_path: snapshot_rel,
        created_at: stamp,
        size: bytes.len() as u64,
        reason: reason.to_string(),
        content_hash,
    };
    index.snapshots.push(entry.clone());
    cleanup_snapshots_for_file(&vault, &mut index, &relative);
    write_recovery_index(&vault, &index)?;
    Ok(Some(entry))
}

pub fn list_snapshots(
    vault_path: &str,
    file_path: Option<&str>,
) -> Result<Vec<SnapshotEntry>, String> {
    let vault = ensure_vault(vault_path)?;
    let filter = match file_path {
        Some(path) if !path.trim().is_empty() => {
            let target = path_inside_vault(&vault, path)?;
            Some(relative_to_vault(&vault, &target)?)
        }
        _ => None,
    };
    let mut snapshots = read_recovery_index(&vault).snapshots;
    if let Some(filter_path) = filter {
        snapshots.retain(|entry| entry.file_path == filter_path);
    }
    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(snapshots)
}

pub fn read_snapshot(vault_path: &str, snapshot_id: &str) -> Result<String, String> {
    let vault = ensure_vault(vault_path)?;
    let index = read_recovery_index(&vault);
    let entry = index
        .snapshots
        .into_iter()
        .find(|entry| entry.id == snapshot_id)
        .ok_or_else(|| "Snapshot not found.".to_string())?;
    read_file(&vault.join(entry.snapshot_path).to_string_lossy())
}

pub fn restore_snapshot(vault_path: &str, snapshot_id: &str) -> Result<String, String> {
    let vault = ensure_vault(vault_path)?;
    let index = read_recovery_index(&vault);
    let entry = index
        .snapshots
        .into_iter()
        .find(|entry| entry.id == snapshot_id)
        .ok_or_else(|| "Snapshot not found.".to_string())?;
    let target = vault.join(&entry.file_path);
    if target.exists() {
        let _ = create_snapshot(vault_path, &target.to_string_lossy(), "before-restore");
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(vault.join(entry.snapshot_path), &target).map_err(|e| e.to_string())?;

    let mut index = read_recovery_index(&vault);
    delete_snapshots_after(&vault, &mut index, &entry.file_path, &entry.created_at);
    write_recovery_index(&vault, &index)?;

    Ok(target.to_string_lossy().to_string())
}

pub fn move_to_trash(vault_path: &str, path: &str) -> Result<TrashEntry, String> {
    let vault = ensure_vault(vault_path)?;
    let target = path_inside_vault(&vault, path)?;
    let relative = relative_to_vault(&vault, &target)?;
    let is_directory = target.is_dir();
    let size = if is_directory {
        dir_size_recursive(&target)
    } else {
        target.metadata().map(|m| m.len()).unwrap_or(0)
    };
    let id = format!("{}-{}", stable_hash(&relative), now_stamp());
    let trash_rel = format!(".thinkingkity/recovery/trash/{}/content", id);
    let trash_abs = vault.join(&trash_rel);
    if let Some(parent) = trash_abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&target, &trash_abs).map_err(|e| e.to_string())?;

    let entry = TrashEntry {
        id,
        original_path: relative,
        trash_path: trash_rel,
        deleted_at: now_stamp(),
        size,
        is_directory,
    };
    let mut index = read_recovery_index(&vault);
    index.trash.push(entry.clone());
    write_recovery_index(&vault, &index)?;
    Ok(entry)
}

pub fn list_trash(vault_path: &str) -> Result<Vec<TrashEntry>, String> {
    let vault = ensure_vault(vault_path)?;
    let mut trash = read_recovery_index(&vault).trash;
    trash.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(trash)
}

pub fn restore_trash(
    vault_path: &str,
    trash_id: &str,
    target_path: Option<&str>,
) -> Result<String, String> {
    let vault = ensure_vault(vault_path)?;
    let mut index = read_recovery_index(&vault);
    let entry = index
        .trash
        .iter()
        .find(|entry| entry.id == trash_id)
        .cloned()
        .ok_or_else(|| "Trash entry not found.".to_string())?;
    let source = vault.join(&entry.trash_path);
    if !source.exists() {
        return Err("Trash content is missing.".to_string());
    }

    let target = if let Some(path) = target_path.filter(|p| !p.trim().is_empty()) {
        let requested = Path::new(path);
        if requested.is_absolute() {
            path_inside_vault(&vault, path)?
        } else {
            for component in requested.components() {
                match component {
                    std::path::Component::Normal(part) => {
                        if part.to_string_lossy().chars().any(|ch| ch.is_control()) {
                            return Err("Control characters are not allowed.".to_string());
                        }
                    }
                    _ => return Err("Only normal relative path segments are allowed.".to_string()),
                }
            }
            if requested.components().next().and_then(|c| c.as_os_str().to_str()) == Some(".thinkingkity") {
                return Err("Recovery cannot restore into internal vault metadata.".to_string());
            }
            vault.join(requested)
        }
    } else {
        vault.join(&entry.original_path)
    };
    let target = unique_existing_target(&target);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&source, &target).or_else(|_| {
        if entry.is_directory {
            copy_dir_recursive(&source, &target)?;
            fs::remove_dir_all(&source).map_err(|e| e.to_string())
        } else {
            fs::copy(&source, &target).map_err(|e| e.to_string())?;
            fs::remove_file(&source).map_err(|e| e.to_string())
        }
    })?;

    index.trash.retain(|item| item.id != trash_id);
    let _ = fs::remove_dir_all(recovery_dir(&vault).join("trash").join(&entry.id));
    write_recovery_index(&vault, &index)?;
    Ok(target.to_string_lossy().to_string())
}

pub fn delete_trash_entry(vault_path: &str, trash_id: &str) -> Result<(), String> {
    let vault = ensure_vault(vault_path)?;
    let mut index = read_recovery_index(&vault);
    let entry = index
        .trash
        .iter()
        .find(|entry| entry.id == trash_id)
        .cloned()
        .ok_or_else(|| "Trash entry not found.".to_string())?;
    let trash_root = recovery_dir(&vault).join("trash").join(&entry.id);
    if trash_root.exists() {
        fs::remove_dir_all(trash_root).map_err(|e| e.to_string())?;
    }
    index.trash.retain(|item| item.id != trash_id);
    write_recovery_index(&vault, &index)
}

// ── vault markdown ──

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

    let vault = check_path_allowed(vault_path)?;
    let vault = vault
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

// ── playwright ──

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

pub fn browse_page_with_playwright(url: String, options: Option<String>) -> Result<String, String> {
    let safe_url = validate_public_http_url(&url)?;
    let script = find_playwright_script()?;
    let mut command = Command::new("node");
    command
        .arg(script)
        .arg(safe_url)
        .arg("15000");
    if let Some(opts) = options {
        command.arg(opts);
    }
    let output = command
        .output()
        .map_err(|e| format!("Failed to start Playwright helper: {}", e))?;

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = if !stdout.trim().is_empty() { stdout } else { stderr };
        return Err(message.trim().to_string());
    }

    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}

// ── vault listing for web mode ──

/// Scan allowed_paths for potential vault directories (subdirectories that are not hidden).
#[derive(Debug, Serialize)]
pub struct VaultCandidate {
    pub name: String,
    pub path: String,
}

pub fn list_vaults() -> Result<Vec<VaultCandidate>, String> {
    let mut candidates = Vec::new();
    let data = crate::global_config::get_allowed_paths()?;

    for allowed in &data {
        let allowed_path = Path::new(allowed);
        if !allowed_path.is_dir() {
            continue;
        }
        // Each allowed_path itself is a potential vault.
        let name = allowed_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| allowed.clone());
        candidates.push(VaultCandidate {
            name,
            path: allowed.clone(),
        });

        // Also scan one level of subdirectories.
        if let Ok(entries) = fs::read_dir(allowed_path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let path = entry.path().to_string_lossy().to_string();
                    // Don't duplicate if the path itself is an allowed_path.
                    if candidates.iter().any(|c: &VaultCandidate| c.path == path) {
                        continue;
                    }
                    candidates.push(VaultCandidate { name, path });
                }
            }
        }
    }

    // Also include demo vault.
    if let Ok(demo) = global_config::get_demo_vault_path() {
        if demo.is_dir() {
            candidates.push(VaultCandidate {
                name: "Demo Vault".to_string(),
                path: demo.to_string_lossy().to_string(),
            });
        }
    }

    Ok(candidates)
}
