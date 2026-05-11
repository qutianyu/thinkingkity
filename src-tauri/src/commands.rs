use crate::fs_ops;

// Re-export FileEntry so the Tauri invoke handler sees the right type.
pub use fs_ops::FileEntry;
pub use fs_ops::{SnapshotEntry, TrashEntry};

#[tauri::command]
pub fn read_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    fs_ops::read_directory(path)
}

#[tauri::command]
pub fn read_file(path: &str) -> Result<String, String> {
    fs_ops::read_file(path)
}

#[tauri::command]
pub fn read_file_base64(path: &str) -> Result<String, String> {
    fs_ops::read_file_base64(path)
}

#[tauri::command]
pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    fs_ops::write_file(path, content)
}

#[tauri::command]
pub fn write_file_base64(path: &str, content: &str) -> Result<(), String> {
    fs_ops::write_file_base64(path, content)
}

#[tauri::command]
pub fn create_file(path: &str) -> Result<(), String> {
    fs_ops::create_file(path)
}

#[tauri::command]
pub fn create_folder(path: &str) -> Result<(), String> {
    fs_ops::create_folder(path)
}

#[tauri::command]
pub fn copy_file(source_path: &str, destination_path: &str) -> Result<(), String> {
    fs_ops::copy_file(source_path, destination_path)
}

#[tauri::command]
pub fn rename_file(old_path: &str, new_path: &str) -> Result<(), String> {
    fs_ops::rename_file(old_path, new_path)
}

#[tauri::command]
pub fn delete_file(path: &str) -> Result<(), String> {
    fs_ops::delete_file(path)
}

#[tauri::command]
pub fn get_vault_size(path: &str) -> Result<u64, String> {
    fs_ops::get_vault_size(path)
}

#[tauri::command]
pub fn create_snapshot(
    vault_path: &str,
    file_path: &str,
    reason: &str,
) -> Result<Option<SnapshotEntry>, String> {
    fs_ops::create_snapshot(vault_path, file_path, reason)
}

#[tauri::command]
pub fn list_snapshots(
    vault_path: &str,
    file_path: Option<&str>,
) -> Result<Vec<SnapshotEntry>, String> {
    fs_ops::list_snapshots(vault_path, file_path)
}

#[tauri::command]
pub fn read_snapshot(vault_path: &str, snapshot_id: &str) -> Result<String, String> {
    fs_ops::read_snapshot(vault_path, snapshot_id)
}

#[tauri::command]
pub fn restore_snapshot(vault_path: &str, snapshot_id: &str) -> Result<String, String> {
    fs_ops::restore_snapshot(vault_path, snapshot_id)
}

#[tauri::command]
pub fn move_to_trash(vault_path: &str, path: &str) -> Result<TrashEntry, String> {
    fs_ops::move_to_trash(vault_path, path)
}

#[tauri::command]
pub fn list_trash(vault_path: &str) -> Result<Vec<TrashEntry>, String> {
    fs_ops::list_trash(vault_path)
}

#[tauri::command]
pub fn restore_trash(
    vault_path: &str,
    trash_id: &str,
    target_path: Option<&str>,
) -> Result<String, String> {
    fs_ops::restore_trash(vault_path, trash_id, target_path)
}

#[tauri::command]
pub fn delete_trash_entry(vault_path: &str, trash_id: &str) -> Result<(), String> {
    fs_ops::delete_trash_entry(vault_path, trash_id)
}

#[tauri::command]
pub fn write_vault_markdown_file(
    vault_path: &str,
    relative_path: &str,
    content: &str,
) -> Result<String, String> {
    fs_ops::write_vault_markdown_file(vault_path, relative_path, content)
}

#[tauri::command]
pub async fn browse_page_with_playwright(
    url: String,
    options: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fs_ops::browse_page_with_playwright(url, options)
    })
    .await
    .map_err(|e| format!("Playwright helper task failed: {}", e))?
}

#[tauri::command]
pub fn list_vaults() -> Result<Vec<fs_ops::VaultCandidate>, String> {
    fs_ops::list_vaults()
}
