// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod global_config;
mod sync_common;
mod sync_git;

fn main() {
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
            commands::write_vault_markdown_file,
            commands::browse_page_with_playwright,
            commands::create_file,
            commands::create_folder,
            commands::copy_file,
            commands::rename_file,
            commands::delete_file,
            commands::get_vault_size,
            sync_git::sync_git_init,
            sync_git::sync_git_sync,
            global_config::read_global_vaults,
            global_config::write_global_vaults,
            global_config::ensure_demo_vault,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal: {}", e);
            std::process::exit(1);
        });
}
