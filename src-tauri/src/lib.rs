use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

static ACTIVE_BACKEND_PORT: AtomicU16 = AtomicU16::new(5170);
static LAST_BACKEND_ERROR: Mutex<Option<String>> = Mutex::new(None);

struct SidecarState(pub Mutex<Option<CommandChild>>);

#[tauri::command]
fn get_backend_port() -> u16 {
    ACTIVE_BACKEND_PORT.load(Ordering::Relaxed)
}

#[tauri::command]
fn get_backend_error() -> Option<String> {
    LAST_BACKEND_ERROR.lock().ok().and_then(|g| g.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_mcp_bridge::init());

    builder
        .manage(SidecarState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_backend_port, get_backend_error])
        .setup(|_app| {
            println!("[Tauri] Setting up MCP Router Desktop Shell...");

            #[cfg(not(debug_assertions))]
            {
                match _app.shell().sidecar("backend") {
                    Ok(command) => {
                        match command.spawn() {
                            Ok((mut rx, child)) => {
                                println!("[Tauri] Successfully spawned Bun backend sidecar process.");
                                if let Ok(mut guard) = _app.state::<SidecarState>().0.lock() {
                                    *guard = Some(child);
                                }

                                tauri::async_runtime::spawn(async move {
                                    while let Some(event) = rx.recv().await {
                                        match event {
                                            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                                                let text = String::from_utf8_lossy(&line);
                                                if text.contains("🚀 MCP Router starting on") {
                                                    if let Some(port_str) = text.split(':').last() {
                                                        if let Ok(port) = port_str.trim().parse::<u16>() {
                                                            println!("[Tauri] Detected backend bound to port {}", port);
                                                            ACTIVE_BACKEND_PORT.store(port, Ordering::Relaxed);
                                                        }
                                                    }
                                                }
                                                if text.contains("[Server Startup Error]") || text.contains("already in use") {
                                                    if let Ok(mut guard) = LAST_BACKEND_ERROR.lock() {
                                                        *guard = Some(text.trim().to_string());
                                                    }
                                                }
                                                println!("[Backend Stdout] {}", text.trim_end());
                                            }
                                            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                                                let text = String::from_utf8_lossy(&line);
                                                if text.contains("[Server Startup Error]") || text.contains("already in use") || text.contains("EADDRINUSE") {
                                                    if let Ok(mut guard) = LAST_BACKEND_ERROR.lock() {
                                                        *guard = Some(text.trim().to_string());
                                                    }
                                                }
                                                eprintln!("[Backend Stderr] {}", text.trim_end());
                                            }
                                            _ => {}
                                        }
                                    }
                                });
                            }
                            Err(err) => {
                                let err_msg = format!("Failed to spawn Bun backend sidecar: {}", err);
                                eprintln!("[Tauri] {}", err_msg);
                                if let Ok(mut guard) = LAST_BACKEND_ERROR.lock() {
                                    *guard = Some(err_msg);
                                }
                            }
                        }
                    }
                    Err(err) => {
                        let err_msg = format!("Failed to configure Bun backend sidecar command: {}", err);
                        eprintln!("[Tauri] {}", err_msg);
                        if let Ok(mut guard) = LAST_BACKEND_ERROR.lock() {
                            *guard = Some(err_msg);
                        }
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

