pub mod commands;
pub mod fs_ops;
pub mod global_config;
pub mod server;
pub mod sync_common;
pub mod sync_git;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_directory,
            commands::read_file,
            commands::read_file_base64,
            commands::write_file,
            commands::write_file_base64,
            commands::write_vault_markdown_file,
            commands::browse_page_with_playwright,
            commands::create_file,
            commands::create_folder,
            commands::copy_file,
            commands::rename_file,
            commands::delete_file,
            commands::get_vault_size,
            commands::create_snapshot,
            commands::list_snapshots,
            commands::read_snapshot,
            commands::restore_snapshot,
            commands::move_to_trash,
            commands::list_trash,
            commands::restore_trash,
            commands::delete_trash_entry,
            commands::list_vaults,
            sync_git::sync_git_init,
            sync_git::sync_git_sync,
            global_config::read_global_vaults,
            global_config::write_global_vaults,
            global_config::read_login_status,
            global_config::verify_login,
            global_config::logout,
            global_config::read_allowed_paths,
            global_config::write_allowed_paths,
            global_config::ensure_demo_vault,
            global_config::ensure_allowed_path_cmd,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal: {}", e);
            std::process::exit(1);
        });
}
