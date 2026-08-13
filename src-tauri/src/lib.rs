mod actions;
mod compose;
mod emoji;
mod icon_packs;
mod icon_prompts;
mod inputs;
mod library;
mod pattern;
mod project;
mod qr;
mod queue;
mod sheet;
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
            actions::studio_dir,
            project::analyze_project,
            project::scan_image_usages,
            project::delete_files,
            inputs::expand_inputs,
            library::library_dir,
            library::library_list,
            library::library_import,
            library::library_delete,
            library::library_rename,
            sheet::sheet_cutout,
            sheet::sheet_preview,
            sheet::sheet_commit,
            compose::composition_dir,
            compose::save_composition,
            pattern::pattern_dir,
            pattern::pattern_export,
            pattern::pattern_save_json,
            pattern::pattern_list_json,
            pattern::pattern_read_json,
            emoji::emoji_dir,
            emoji::list_svgs,
            emoji::save_emoji_svg,
            emoji::save_emoji_png,
            emoji::save_emoji_animation,
            qr::qr_matrix,
            qr::verify_qr,
            qr::detect_theme_colors,
            qr::read_font,
            qr::read_image_data_url,
            qr::find_fonts,
            qr::qr_dir,
            qr::save_qr_png,
            queue::cancel_jobs,
            thumbs::make_thumb,
            tools::check_tools,
            tools::platform_info,
            watcher::watch_project,
            watcher::unwatch_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
