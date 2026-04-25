use rusqlite::{Connection, Result as SqliteResult, params};
use std::path::PathBuf;
use std::sync::Mutex;
use chrono::Local;
use uuid::Uuid;
use base64::Engine as _;

pub struct Db {
    pub conn: Mutex<Connection>,
}

impl Db {
    pub fn new() -> SqliteResult<Self> {
        let db_path = get_db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        let db = Db { conn: Mutex::new(conn) };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                parent_id TEXT,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('folder', 'note')),
                date TEXT,
                content TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                note_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (note_id) REFERENCES items(id) ON DELETE CASCADE
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
                name, content, content='items', content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
                INSERT INTO items_fts(rowid, name, content)
                VALUES (new.rowid, new.name, new.content);
            END;

            CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
                INSERT INTO items_fts(items_fts, rowid, name, content)
                VALUES ('delete', old.rowid, old.name, old.content);
            END;

            CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
                INSERT INTO items_fts(items_fts, rowid, name, content)
                VALUES ('delete', old.rowid, old.name, old.content);
                INSERT INTO items_fts(rowid, name, content)
                VALUES (new.rowid, new.name, new.content);
            END;

            CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_id);
            CREATE INDEX IF NOT EXISTS idx_items_date ON items(date);
            CREATE INDEX IF NOT EXISTS idx_items_sort ON items(parent_id, sort_order);
            CREATE INDEX IF NOT EXISTS idx_images_note ON images(note_id);"
        )?;

        // Rebuild FTS index for existing rows (handles migration from pre-trigger schema)
        let has_items: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM items", [], |r| r.get(0)
        ).unwrap_or(false);
        if has_items {
            let has_fts: bool = conn.query_row(
                "SELECT COUNT(*) > 0 FROM items_fts", [], |r| r.get(0)
            ).unwrap_or(false);
            if !has_fts {
                conn.execute_batch("INSERT INTO items_fts(items_fts) VALUES ('rebuild')")?;
            }
        }

        Ok(())
    }

    pub fn create_item(&self, parent_id: Option<&str>, name: &str, item_type: &str, date: Option<&str>) -> SqliteResult<String> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        conn.execute(
            "INSERT INTO items (id, parent_id, name, type, date, content, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, '', 0, ?6, ?6)",
            params![id, parent_id, name, item_type, date, now],
        )?;

        Ok(id)
    }

    pub fn get_item(&self, id: &str) -> SqliteResult<Option<Item>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
             FROM items WHERE id = ?1"
        )?;

        let item = stmt.query_row(params![id], |row| {
            Ok(Item {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                item_type: row.get(3)?,
                date: row.get(4)?,
                content: row.get(5)?,
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        }).optional()?;

        Ok(item)
    }

    pub fn update_item(&self, id: &str, name: Option<&str>, content: Option<&str>, date: Option<&str>) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        if let Some(n) = name {
            conn.execute(
                "UPDATE items SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![n, now, id],
            )?;
        }

        if let Some(c) = content {
            conn.execute(
                "UPDATE items SET content = ?1, updated_at = ?2 WHERE id = ?3",
                params![c, now, id],
            )?;
        }

        if let Some(d) = date {
            conn.execute(
                "UPDATE items SET date = ?1, updated_at = ?2 WHERE id = ?3",
                params![d, now, id],
            )?;
        }

        Ok(())
    }

    pub fn delete_item(&self, id: &str) -> SqliteResult<()> {
        let children: Vec<String> = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id FROM items WHERE parent_id = ?1")?;
            let xs: Vec<String> = stmt.query_map(params![id], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            xs
        };

        for child_id in children {
            self.delete_item(&child_id)?;
        }

        let paths: Vec<String> = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT path FROM images WHERE note_id = ?1")?;
            let xs: Vec<String> = stmt.query_map(params![id], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            xs
        };

        for path in paths {
            let full_path = get_data_dir().join(&path);
            let _ = std::fs::remove_file(full_path);
        }

        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM images WHERE note_id = ?1", params![id])?;
        conn.execute("DELETE FROM items WHERE id = ?1", params![id])?;

        Ok(())
    }

    pub fn move_item(&self, id: &str, new_parent_id: Option<&str>) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        conn.execute(
            "UPDATE items SET parent_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_parent_id, now, id],
        )?;

        Ok(())
    }

    pub fn reorder_items(&self, items: &[(String, i32)]) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        for (id, sort_order) in items {
            conn.execute(
                "UPDATE items SET sort_order = ?1 WHERE id = ?2",
                params![sort_order, id],
            )?;
        }
        Ok(())
    }

    pub fn list_items(&self, parent_id: Option<&str>, item_type: Option<&str>, date: Option<&str>) -> SqliteResult<Vec<Item>> {
        let conn = self.conn.lock().unwrap();

        let sql = match (parent_id, item_type, date) {
            (Some(_), Some(_), Some(_)) =>
                "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
                 FROM items WHERE parent_id = ?1 AND type = ?2 AND date = ?3 ORDER BY sort_order ASC",
            (Some(_), Some(_), None) =>
                "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
                 FROM items WHERE parent_id = ?1 AND type = ?2 ORDER BY sort_order ASC",
            (Some(_), None, Some(_)) =>
                "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
                 FROM items WHERE parent_id = ?1 AND date = ?2 ORDER BY sort_order ASC",
            (Some(_), None, None) =>
                "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
                 FROM items WHERE parent_id = ?1 ORDER BY sort_order ASC",
            (None, Some(_), Some(_)) =>
                "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
                 FROM items WHERE parent_id IS NULL AND type = ?1 AND date = ?2 ORDER BY sort_order ASC",
            (None, Some(_), None) =>
                "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
                 FROM items WHERE parent_id IS NULL AND type = ?1 ORDER BY sort_order ASC",
            (None, None, Some(_)) =>
                "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
                 FROM items WHERE parent_id IS NULL AND date = ?1 ORDER BY sort_order ASC",
            (None, None, None) =>
                "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
                 FROM items WHERE parent_id IS NULL ORDER BY sort_order ASC",
        };

        let mut stmt = conn.prepare(sql)?;

        let items = match (parent_id, item_type, date) {
            (Some(p), Some(t), Some(d)) => stmt.query_map(params![p, t, d], |row| Item::from_row(row))?.filter_map(|r| r.ok()).collect(),
            (Some(p), Some(t), None)    => stmt.query_map(params![p, t], |row| Item::from_row(row))?.filter_map(|r| r.ok()).collect(),
            (Some(p), None, Some(d))    => stmt.query_map(params![p, d], |row| Item::from_row(row))?.filter_map(|r| r.ok()).collect(),
            (Some(p), None, None)       => stmt.query_map(params![p], |row| Item::from_row(row))?.filter_map(|r| r.ok()).collect(),
            (None, Some(t), Some(d))    => stmt.query_map(params![t, d], |row| Item::from_row(row))?.filter_map(|r| r.ok()).collect(),
            (None, Some(t), None)       => stmt.query_map(params![t], |row| Item::from_row(row))?.filter_map(|r| r.ok()).collect(),
            (None, None, Some(d))       => stmt.query_map(params![d], |row| Item::from_row(row))?.filter_map(|r| r.ok()).collect(),
            (None, None, None)          => stmt.query_map([], |row| Item::from_row(row))?.filter_map(|r| r.ok()).collect(),
        };

        Ok(items)
    }

    pub fn list_all_items(&self) -> SqliteResult<Vec<Item>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, parent_id, name, type, date, content, sort_order, created_at, updated_at
             FROM items ORDER BY parent_id NULLS FIRST, sort_order ASC"
        )?;
        let items = stmt.query_map([], |row| Item::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(items)
    }

    pub fn search_items(&self, query: &str) -> SqliteResult<Vec<SearchResult>> {
        if query.trim().is_empty() {
            return Ok(vec![]);
        }

        let conn = self.conn.lock().unwrap();

        // Wrap each token in quotes for safe literal FTS5 matching
        let fts_query: String = query.split_whitespace()
            .map(|word| format!("\"{}\"", word.replace('"', "")))
            .collect::<Vec<_>>()
            .join(" ");

        let mut stmt = conn.prepare(
            "SELECT i.id, i.name, i.date,
                    snippet(items_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet
             FROM items_fts
             JOIN items i ON items_fts.rowid = i.rowid
             WHERE items_fts MATCH ?1
             LIMIT 50"
        )?;

        let results = stmt.query_map(params![fts_query], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                name: row.get(1)?,
                date: row.get(2)?,
                snippet: row.get(3)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(results)
    }

    /// Decodes base64 image data, writes to disk, records in DB, returns absolute file path.
    pub fn save_image(&self, note_id: &str, filename: &str, data_base64: &str) -> Result<String, String> {
        // Strip "data:image/png;base64," prefix if present
        let raw_b64 = if let Some(pos) = data_base64.find(',') {
            &data_base64[pos + 1..]
        } else {
            data_base64
        };

        let data = base64::engine::general_purpose::STANDARD
            .decode(raw_b64)
            .map_err(|e| format!("base64 decode failed: {e}"))?;

        let id = Uuid::new_v4().to_string();
        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        let saved_name = format!("{}.{}", id, ext);

        let images_dir = get_data_dir().join("images");
        std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
        let file_path = images_dir.join(&saved_name);
        std::fs::write(&file_path, &data).map_err(|e| e.to_string())?;

        let relative_path = format!("images/{}", saved_name);
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO images (id, note_id, filename, path, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, note_id, saved_name, relative_path, now],
        ).map_err(|e| e.to_string())?;

        Ok(file_path.to_string_lossy().to_string())
    }

    pub fn get_image(&self, id: &str) -> SqliteResult<Option<Image>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, note_id, filename, path, created_at FROM images WHERE id = ?1"
        )?;

        let image = stmt.query_row(params![id], |row| {
            Ok(Image {
                id: row.get(0)?,
                note_id: row.get(1)?,
                filename: row.get(2)?,
                path: row.get(3)?,
                created_at: row.get(4)?,
            })
        }).optional()?;

        Ok(image)
    }
}

fn get_data_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".notekeep")
        .join("data")
}

fn get_db_path() -> PathBuf {
    get_data_dir().join("notekeep.db")
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Item {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub item_type: String,
    pub date: Option<String>,
    pub content: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

impl Item {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Item {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
            item_type: row.get(3)?,
            date: row.get(4)?,
            content: row.get(5)?,
            sort_order: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Image {
    pub id: String,
    pub note_id: String,
    pub filename: String,
    pub path: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub name: String,
    pub date: Option<String>,
    pub snippet: String,
}

trait OptionalExt<T> {
    fn optional(self) -> SqliteResult<Option<T>>;
}

impl<T> OptionalExt<T> for SqliteResult<T> {
    fn optional(self) -> SqliteResult<Option<T>> {
        match self {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

#[tauri::command]
pub fn create_item(db: tauri::State<Db>, parent_id: Option<String>, name: String, item_type: String, date: Option<String>) -> Result<String, String> {
    db.create_item(parent_id.as_deref(), &name, &item_type, date.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_item(db: tauri::State<Db>, id: String) -> Result<Option<Item>, String> {
    db.get_item(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_item(db: tauri::State<Db>, id: String, name: Option<String>, content: Option<String>, date: Option<String>) -> Result<(), String> {
    db.update_item(&id, name.as_deref(), content.as_deref(), date.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_item(db: tauri::State<Db>, id: String) -> Result<(), String> {
    db.delete_item(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_item(db: tauri::State<Db>, id: String, new_parent_id: Option<String>) -> Result<(), String> {
    db.move_item(&id, new_parent_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_items(db: tauri::State<Db>, items: Vec<(String, i32)>) -> Result<(), String> {
    db.reorder_items(&items).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_items(db: tauri::State<Db>, parent_id: Option<String>, item_type: Option<String>, date: Option<String>) -> Result<Vec<Item>, String> {
    db.list_items(parent_id.as_deref(), item_type.as_deref(), date.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_all_items(db: tauri::State<Db>) -> Result<Vec<Item>, String> {
    db.list_all_items().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_items(db: tauri::State<Db>, query: String) -> Result<Vec<SearchResult>, String> {
    db.search_items(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_image(db: tauri::State<Db>, note_id: String, filename: String, data_base64: String) -> Result<String, String> {
    db.save_image(&note_id, &filename, &data_base64)
}

#[tauri::command]
pub fn get_image(db: tauri::State<Db>, id: String) -> Result<Option<Image>, String> {
    db.get_image(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_image_base64(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}

fn topological_sort(items: Vec<Item>) -> Vec<Item> {
    let mut sorted: Vec<Item> = Vec::new();
    let mut remaining = items;
    let mut inserted: std::collections::HashSet<String> = std::collections::HashSet::new();
    let max_iters = remaining.len() + 1;
    let mut i = 0;
    while !remaining.is_empty() && i < max_iters {
        let mut next = Vec::new();
        for item in remaining {
            if item.parent_id.is_none()
                || inserted.contains(item.parent_id.as_deref().unwrap_or(""))
            {
                inserted.insert(item.id.clone());
                sorted.push(item);
            } else {
                next.push(item);
            }
        }
        remaining = next;
        i += 1;
    }
    sorted.extend(remaining); // orphaned items with unknown parent
    sorted
}

#[tauri::command]
pub fn export_data(db: tauri::State<Db>) -> Result<String, String> {
    let items = db.list_all_items().map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&items).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_data(db: tauri::State<Db>, data: String) -> Result<(), String> {
    let items: Vec<Item> = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    let sorted = topological_sort(items);

    let conn = db.conn.lock().unwrap();

    // Disable FK to allow bulk delete without cascade ordering issues
    conn.execute_batch("PRAGMA foreign_keys = OFF;").map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM images", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM items", []).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;

    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for item in &sorted {
        conn.execute(
            "INSERT INTO items (id, parent_id, name, type, date, content, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                item.id, item.parent_id, item.name, item.item_type,
                item.date, item.content, item.sort_order,
                item.created_at, now
            ],
        ).map_err(|e| e.to_string())?;
    }

    // Rebuild FTS from current content
    conn.execute_batch("INSERT INTO items_fts(items_fts) VALUES ('rebuild');")
        .map_err(|e| e.to_string())?;

    Ok(())
}
