// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            thinkingkity::commands::read_directory,
            thinkingkity::commands::read_file,
            thinkingkity::commands::read_file_base64,
            thinkingkity::commands::write_file,
            thinkingkity::commands::write_file_base64,
            thinkingkity::commands::write_vault_markdown_file,
            thinkingkity::commands::browse_page_with_playwright,
            thinkingkity::commands::create_file,
            thinkingkity::commands::create_folder,
            thinkingkity::commands::copy_file,
            thinkingkity::commands::rename_file,
            thinkingkity::commands::delete_file,
            thinkingkity::commands::get_vault_size,
            thinkingkity::commands::create_snapshot,
            thinkingkity::commands::list_snapshots,
            thinkingkity::commands::read_snapshot,
            thinkingkity::commands::restore_snapshot,
            thinkingkity::commands::move_to_trash,
            thinkingkity::commands::list_trash,
            thinkingkity::commands::restore_trash,
            thinkingkity::commands::delete_trash_entry,
            thinkingkity::commands::list_vaults,
            thinkingkity::sync_git::sync_git_init,
            thinkingkity::sync_git::sync_git_sync,
            thinkingkity::global_config::read_global_vaults,
            thinkingkity::global_config::write_global_vaults,
            thinkingkity::global_config::read_login_status,
            thinkingkity::global_config::verify_login,
            thinkingkity::global_config::logout,
            thinkingkity::global_config::read_allowed_paths,
            thinkingkity::global_config::write_allowed_paths,
            thinkingkity::global_config::ensure_demo_vault,
            thinkingkity::global_config::ensure_allowed_path_cmd,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal: {}", e);
            std::process::exit(1);
        });
}
