mod actions;
mod icon_packs;
mod icon_prompts;
mod project;
mod thumbs;
mod tools;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Fix WebKitGTK + NVIDIA sous Wayland (erreur de protocole Gdk 71)
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(watcher::WatcherState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            actions::run_action,
            actions::deliver_prompt,
            project::analyze_project,
            project::scan_image_usages,
            project::delete_files,
            thumbs::make_thumb,
            tools::check_tools,
            tools::platform_info,
            watcher::watch_project,
            watcher::unwatch_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
