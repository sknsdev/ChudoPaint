#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod errors;
mod png;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![png::open_png, png::save_png])
        .run(tauri::generate_context!())
        .expect("failed to run ChudoPaint");
}
