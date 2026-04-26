mod db;

use db::{
    Db, create_item, get_item, update_item, delete_item, move_item,
    reorder_items, list_items, list_all_items, search_items, save_image, get_image, get_image_base64,
    export_data, export_data_to_file, import_data, import_data_from_file,
    backup_database, restore_database,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Db::new().expect("Failed to initialize database");
    log::info!("Database initialized successfully");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            create_item, get_item, update_item, delete_item, move_item,
            reorder_items, list_items, list_all_items, search_items, save_image, get_image, get_image_base64,
            export_data, export_data_to_file, import_data, import_data_from_file,
            backup_database, restore_database
        ])
        .setup(|app| {
            let log_level = if cfg!(debug_assertions) {
                log::LevelFilter::Debug
            } else {
                log::LevelFilter::Info
            };
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .build(),
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
