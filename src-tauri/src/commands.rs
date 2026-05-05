use crate::fs_ops;

// Re-export FileEntry so the Tauri invoke handler sees the right type.
pub use fs_ops::FileEntry;

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
