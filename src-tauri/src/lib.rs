use std::sync::atomic::{AtomicU16, Ordering};
use tauri::Manager;

static ACTIVE_BACKEND_PORT: AtomicU16 = AtomicU16::new(5170);

#[tauri::command]
fn get_backend_port() -> u16 {
    ACTIVE_BACKEND_PORT.load(Ordering::Relaxed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_backend_port])
        .setup(|app| {
            println!("[Tauri] Setting up MCP Router Desktop Shell...");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                println!("[Tauri] App window closing cleanly.");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
