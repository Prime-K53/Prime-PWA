use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

struct AppState {
    backend_origin: Mutex<String>,
}

#[tauri::command]
fn get_backend_url(state: tauri::State<AppState>) -> String {
    state.backend_origin.lock().unwrap().clone()
}

#[tauri::command]
fn read_pdf_file(path: String) -> Result<Vec<u8>, String> {
    let resolved = std::path::PathBuf::from(&path);
    if !resolved.exists() {
        return Err("File not found".into());
    }
    fs::read(&resolved).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_temp_pdf(app: tauri::AppHandle, data: Vec<u8>, filename: Option<String>) -> Result<String, String> {
    let temp_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("temp");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let safe_name = filename
        .unwrap_or_else(|| format!("pv_{}.pdf", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()))
        .replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '_' && c != '-', "_");

    let file_path = temp_dir.join(&safe_name);
    fs::write(&file_path, &data).map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn cleanup_temp_pdf(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let resolved = std::path::PathBuf::from(&path);
    let temp_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("temp");
    let temp_canonical = temp_dir.canonicalize().unwrap_or(temp_dir);
    let file_canonical = resolved.canonicalize().unwrap_or(resolved);

    if !file_canonical.starts_with(&temp_canonical) {
        return Err("Permission denied".into());
    }
    if file_canonical.exists() {
        fs::remove_file(&file_canonical).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_pdf_system(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| e.to_string())
}

fn run_backend(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_shell::ShellExt;

    let backend_root = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("backend");

    let backend_entry = backend_root.join("index.cjs");
    if !backend_entry.exists() {
        log::warn!("Backend entry not found at {:?}", backend_entry);
        return Ok(());
    }

    let port = find_available_port(3000, 3100)?;
    let origin = format!("http://127.0.0.1:{}", port);
    *app.state::<AppState>().backend_origin.lock().unwrap() = origin.clone();

    let storage_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));

    let output = app.shell()
        .command("node")
        .args([
            backend_entry.to_string_lossy().as_ref(),
        ])
        .env("PRIME_ERP_DESKTOP", "true")
        .env("PORT", &port.to_string())
        .env("PRIME_ERP_BACKEND_PORT", &port.to_string())
        .env("PRIME_ERP_STORAGE_DIR", &storage_dir.join("backend").to_string_lossy())
        .env("NODE_ENV", "production")
        .spawn();

    match output {
        Ok(_) => {
            log::info!("Backend started on {}", origin);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to start backend: {}", e);
            Err(e.into())
        }
    }
}

fn find_available_port(start: u16, end: u16) -> Result<u16, Box<dyn std::error::Error>> {
    for port in start..=end {
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err("No available port found".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            backend_origin: Mutex::new(String::new()),
        })
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_backend_url,
            read_pdf_file,
            write_temp_pdf,
            cleanup_temp_pdf,
            open_pdf_system,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = run_backend(&handle) {
                    log::error!("Backend startup failed: {}", e);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
