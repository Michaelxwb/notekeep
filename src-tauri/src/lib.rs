mod db;

use db::{
    Db, create_item, get_item, update_item, delete_item, move_item,
    reorder_items, list_items, list_all_items, search_items, save_image, get_image, get_image_base64,
    export_data, import_data,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Db::new().expect("Failed to initialize database");
    log::info!("Database initialized successfully");

    tauri::Builder::default()
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            create_item, get_item, update_item, delete_item, move_item,
            reorder_items, list_items, list_all_items, search_items, save_image, get_image, get_image_base64,
            export_data, import_data
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
