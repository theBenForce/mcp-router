use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

static ACTIVE_BACKEND_PORT: AtomicU16 = AtomicU16::new(5170);

struct SidecarState(Mutex<Option<CommandChild>>);

#[tauri::command]
fn get_backend_port() -> u16 {
    ACTIVE_BACKEND_PORT.load(Ordering::Relaxed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_mcp_bridge::init());

    builder
        .manage(SidecarState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_backend_port])
        .setup(|app| {
            println!("[Tauri] Setting up MCP Router Desktop Shell...");

            #[cfg(not(debug_assertions))]
            {
                match app.shell().sidecar("backend") {
                    Ok(command) => {
                        match command.spawn() {
                            Ok((_rx, child)) => {
                                println!("[Tauri] Successfully spawned Bun backend sidecar process.");
                                if let Ok(mut guard) = app.state::<SidecarState>().0.lock() {
                                    *guard = Some(child);
                                }
                            }
                            Err(err) => {
                                eprintln!("[Tauri] Failed to spawn Bun backend sidecar: {}", err);
                            }
                        }
                    }
                    Err(err) => {
                        eprintln!("[Tauri] Failed to configure Bun backend sidecar command: {}", err);
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                println!("[Tauri] App window closing cleanly.");
                let app_handle = window.app_handle();
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            println!("[Tauri] Terminating Bun backend sidecar process...");
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

