use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Files the OS asked us to open before the frontend was ready to receive
/// events (macOS delivers Finder "open" events, not command-line arguments).
#[derive(Default)]
struct PendingFiles {
    files: Mutex<Vec<String>>,
    frontend_ready: AtomicBool,
}

/// Turn raw process arguments into absolute file paths, dropping flags.
fn file_args(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-') && !a.is_empty())
        .map(|a| {
            let p = PathBuf::from(&a);
            if p.is_absolute() { p } else { cwd.join(p) }
        })
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Files to open at startup: command-line arguments (Windows/Linux: double-click,
/// "Open with") plus anything the OS handed us before the frontend was listening.
#[tauri::command]
fn launch_args(state: tauri::State<'_, PendingFiles>) -> Vec<String> {
    let cwd = std::env::current_dir().unwrap_or_default();
    let mut files = file_args(std::env::args(), &cwd);
    files.extend(state.files.lock().unwrap().drain(..));
    state.frontend_ready.store(true, Ordering::SeqCst);
    files
}

/// Hand files to the frontend, or park them until it asks for `launch_args`.
fn deliver_files(app: &tauri::AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    let state = app.state::<PendingFiles>();
    if state.frontend_ready.load(Ordering::SeqCst) {
        let _ = app.emit("open-files", files);
    } else {
        state.files.lock().unwrap().extend(files);
    }
}

/// Native macOS menu bar: the standard app/Edit/Window items (so ⌘C/⌘V/⌘Q
/// behave), but no "Close Window" so ⌘W is free to close the active document.
#[cfg(target_os = "macos")]
fn mac_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{AboutMetadataBuilder, MenuBuilder, SubmenuBuilder};
    let about = AboutMetadataBuilder::new()
        .name(Some("Folio PDF"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .build();
    let app_menu = SubmenuBuilder::new(app, "Folio PDF")
        .about(Some(about))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .build()?;
    MenuBuilder::new(app).items(&[&app_menu, &edit, &window]).build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.menu(mac_menu);
    builder
        .manage(PendingFiles::default())
        // Must be registered first: a second launch forwards its args here.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let files = file_args(args, Path::new(&cwd));
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            deliver_files(app, files);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![launch_args])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // Quit requested while the window is still open (macOS ⌘Q / app menu):
            // route it through the window close so the unsaved-changes guard runs.
            tauri::RunEvent::ExitRequested { api, .. } => {
                if let Some(w) = app.get_webview_window("main") {
                    api.prevent_exit();
                    let _ = w.close();
                }
            }
            // macOS/iOS: files opened from Finder or the Dock arrive as URLs.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            tauri::RunEvent::Opened { urls } => {
                let files: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
                deliver_files(app, files);
            }
            _ => {}
        });
}
