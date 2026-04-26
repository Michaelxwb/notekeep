use rusqlite::{Connection, Result as SqliteResult, params};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use chrono::Local;
use uuid::Uuid;
use base64::Engine as _;

pub struct Db {
    pub conn: Mutex<Connection>,
}

impl Db {
    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn new() -> SqliteResult<Self> {
        let db_path = get_db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        }
        let conn = Connection::open(&db_path)?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -8000;
             PRAGMA mmap_size = 268435456;"
        )?;
        let db = Db { conn: Mutex::new(conn) };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> SqliteResult<()> {
        let conn = self.conn();

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
        let conn = self.conn();
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
        let conn = self.conn();
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
        let conn = self.conn();
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        conn.execute(
            "UPDATE items SET
                name = COALESCE(?1, name),
                content = COALESCE(?2, content),
                date = COALESCE(?3, date),
                updated_at = ?4
             WHERE id = ?5",
            params![name, content, date, now, id],
        )?;

        Ok(())
    }

    pub fn delete_item(&self, id: &str) -> SqliteResult<()> {
        let mut conn = self.conn();

        // BFS to collect all descendant IDs
        let mut to_delete = vec![id.to_string()];
        let mut i = 0;
        while i < to_delete.len() {
            let mut stmt = conn.prepare("SELECT id FROM items WHERE parent_id = ?1")?;
            let children: Vec<String> = stmt.query_map(params![to_delete[i]], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            to_delete.extend(children);
            i += 1;
        }

        // Delete image files from disk before DB transaction
        for del_id in &to_delete {
            let mut stmt = conn.prepare("SELECT path FROM images WHERE note_id = ?1")?;
            let paths: Vec<String> = stmt.query_map(params![del_id], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            for path in paths {
                let full_path = get_data_dir().join(&path);
                let _ = std::fs::remove_file(full_path);
            }
        }

        // Delete all in a single transaction
        let tx = conn.transaction()?;
        for del_id in &to_delete {
            tx.execute("DELETE FROM images WHERE note_id = ?1", params![del_id])?;
            tx.execute("DELETE FROM items WHERE id = ?1", params![del_id])?;
        }
        tx.commit()?;

        Ok(())
    }

    pub fn move_item(&self, id: &str, new_parent_id: Option<&str>) -> SqliteResult<()> {
        let conn = self.conn();
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        conn.execute(
            "UPDATE items SET parent_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_parent_id, now, id],
        )?;

        Ok(())
    }

    pub fn reorder_items(&self, items: &[(String, i32)]) -> SqliteResult<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        for (id, sort_order) in items {
            tx.execute(
                "UPDATE items SET sort_order = ?1 WHERE id = ?2",
                params![sort_order, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn list_items(&self, parent_id: Option<&str>, item_type: Option<&str>, date: Option<&str>) -> SqliteResult<Vec<Item>> {
        let conn = self.conn();

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
        let conn = self.conn();
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

        let conn = self.conn();

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

        let conn = self.conn();
        conn.execute(
            "INSERT INTO images (id, note_id, filename, path, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, note_id, saved_name, relative_path, now],
        ).map_err(|e| e.to_string())?;

        Ok(file_path.to_string_lossy().to_string())
    }

    pub fn get_image(&self, id: &str) -> SqliteResult<Option<Image>> {
        let conn = self.conn();
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

// ─── Tauri commands ─────────────────────────────────────────

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
    let n = items.len();
    let mut items: Vec<Option<Item>> = items.into_iter().map(Some).collect();

    let id_to_idx: std::collections::HashMap<&str, usize> = items
        .iter()
        .enumerate()
        .map(|(i, item)| (item.as_ref().unwrap().id.as_str(), i))
        .collect();

    let mut children: Vec<Vec<usize>> = vec![vec![]; n];
    let mut indegree: Vec<usize> = vec![0; n];
    for (i, item) in items.iter().enumerate() {
        if let Some(ref pid) = item.as_ref().unwrap().parent_id {
            if let Some(&p_idx) = id_to_idx.get(pid.as_str()) {
                children[p_idx].push(i);
                indegree[i] += 1;
            }
        }
    }

    let mut queue: Vec<usize> = (0..n).filter(|&i| indegree[i] == 0).collect();
    let mut sorted: Vec<Item> = Vec::with_capacity(n);

    while let Some(idx) = queue.pop() {
        sorted.push(items[idx].take().unwrap());
        for &child in &children[idx] {
            indegree[child] -= 1;
            if indegree[child] == 0 {
                queue.push(child);
            }
        }
    }

    // Append any remaining (cycle orphans) — items still in Option
    for item in items.into_iter().flatten() {
        sorted.push(item);
    }

    sorted
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExportImage {
    pub id: String,
    pub note_id: String,
    pub filename: String,
    pub path: String,
    pub created_at: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExportPayload {
    pub version: u32,
    pub exported_at: String,
    pub items: Vec<Item>,
    pub images: Vec<ExportImage>,
}

fn list_all_images_with_data(db: &Db) -> Result<Vec<ExportImage>, String> {
    let conn = db.conn();
    let mut stmt = conn
        .prepare("SELECT id, note_id, filename, path, created_at FROM images")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let data_dir = get_data_dir();
    let mut images = Vec::new();
    for row in rows {
        let (id, note_id, filename, path, created_at) = row.map_err(|e| e.to_string())?;
        let abs_path = data_dir.join(&path);
        let bytes = std::fs::read(&abs_path).unwrap_or_default();
        if bytes.is_empty() {
            log::error!("image file missing or empty: {}", abs_path.display());
        }
        let data_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        images.push(ExportImage { id, note_id, filename, path, created_at, data_base64 });
    }
    Ok(images)
}

#[tauri::command]
pub fn export_data(db: tauri::State<Db>) -> Result<String, String> {
    let items = db.list_all_items().map_err(|e| e.to_string())?;
    let images = list_all_images_with_data(&db)?;
    let payload = ExportPayload {
        version: 1,
        exported_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        items,
        images,
    };
    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_data_to_file(db: tauri::State<Db>, path: String) -> Result<(), String> {
    let items = db.list_all_items().map_err(|e| e.to_string())?;
    let images = list_all_images_with_data(&db)?;
    let payload = ExportPayload {
        version: 1,
        exported_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        items,
        images,
    };
    let json = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    log::info!("exported {} items + {} images to {}", payload.items.len(), payload.images.len(), path);
    Ok(())
}

fn parse_payload(data: &str) -> Result<ExportPayload, String> {
    if let Ok(p) = serde_json::from_str::<ExportPayload>(data) {
        return Ok(p);
    }
    // 兼容旧格式：纯 items 数组
    let items: Vec<Item> = serde_json::from_str(data)
        .map_err(|e| format!("invalid import data: {e}"))?;
    Ok(ExportPayload {
        version: 0,
        exported_at: String::new(),
        items,
        images: vec![],
    })
}

fn import_payload(db: &Db, payload: ExportPayload) -> Result<(usize, usize), String> {
    let sorted = topological_sort(payload.items);
    let mut conn = db.conn();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for item in &sorted {
        tx.execute(
            "INSERT INTO items (id, parent_id, name, type, date, content, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                parent_id = excluded.parent_id,
                name = excluded.name,
                type = excluded.type,
                date = excluded.date,
                content = excluded.content,
                sort_order = excluded.sort_order,
                updated_at = excluded.updated_at
             WHERE excluded.updated_at > items.updated_at",
            params![
                item.id, item.parent_id, item.name, item.item_type,
                item.date, item.content, item.sort_order,
                item.created_at, item.updated_at
            ],
        ).map_err(|e| e.to_string())?;
    }

    // 落盘图片 + upsert images 表（id 已存在则跳过）
    let data_dir = get_data_dir();
    std::fs::create_dir_all(data_dir.join("images")).map_err(|e| e.to_string())?;
    for img in &payload.images {
        let abs_path = data_dir.join(&img.path);
        if !abs_path.exists() && !img.data_base64.is_empty() {
            let raw_b64 = img.data_base64.split(',').last().unwrap_or(&img.data_base64);
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(raw_b64)
                .map_err(|e| format!("base64 decode failed for image {}: {}", img.id, e))?;
            if let Some(parent) = abs_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::write(&abs_path, bytes).map_err(|e| e.to_string())?;
        }

        tx.execute(
            "INSERT INTO images (id, note_id, filename, path, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO NOTHING",
            params![img.id, img.note_id, img.filename, img.path, img.created_at],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok((sorted.len(), payload.images.len()))
}

#[tauri::command]
pub fn import_data(db: tauri::State<Db>, data: String) -> Result<(), String> {
    let payload = parse_payload(&data)?;
    let (n_items, n_images) = import_payload(&db, payload)?;
    log::info!("merge-import: {} items, {} images", n_items, n_images);
    Ok(())
}

#[tauri::command]
pub fn import_data_from_file(db: tauri::State<Db>, path: String) -> Result<(), String> {
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let payload = parse_payload(&data)?;
    let (n_items, n_images) = import_payload(&db, payload)?;
    log::info!("merge-import from {}: {} items, {} images", path, n_items, n_images);
    Ok(())
}

#[tauri::command]
pub fn backup_database(db: tauri::State<Db>, path: String) -> Result<(), String> {
    use zip::write::SimpleFileOptions;

    let data_dir = get_data_dir();

    // VACUUM INTO 写一份干净副本到临时文件
    let tmp_db = std::env::temp_dir().join(format!("notekeep-backup-{}.db", Uuid::new_v4()));
    {
        let conn = db.conn();
        conn.execute_batch(&format!(
            "VACUUM INTO '{}'",
            tmp_db.to_string_lossy().replace('\'', "''")
        )).map_err(|e| e.to_string())?;
    }

    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Stream DB file into zip instead of loading entirely into memory
    {
        let mut db_file = std::fs::File::open(&tmp_db).map_err(|e| e.to_string())?;
        zip.start_file("data/notekeep.db", opts).map_err(|e| e.to_string())?;
        std::io::copy(&mut db_file, &mut zip).map_err(|e| e.to_string())?;
    }

    let images_dir = data_dir.join("images");
    if images_dir.is_dir() {
        for entry in std::fs::read_dir(&images_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_file() {
                let name = entry.file_name().to_string_lossy().to_string();
                let mut img_file = std::fs::File::open(entry.path()).map_err(|e| e.to_string())?;
                zip.start_file(format!("data/images/{}", name), opts)
                    .map_err(|e| e.to_string())?;
                std::io::copy(&mut img_file, &mut zip).map_err(|e| e.to_string())?;
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp_db);

    log::info!("backup written to {}", path);
    Ok(())
}

#[tauri::command]
pub fn restore_database(
    app: tauri::AppHandle,
    db: tauri::State<Db>,
    path: String,
) -> Result<(), String> {
    let data_dir = get_data_dir();
    let parent = data_dir.parent().ok_or_else(|| "invalid data dir".to_string())?.to_path_buf();

    // 校验 zip：必须含 data/notekeep.db，且所有条目都在 data/ 下
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut has_db = false;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name();
        if !name.starts_with("data/") || name.contains("..") {
            return Err(format!("invalid entry in backup: {}", name));
        }
        if name == "data/notekeep.db" {
            has_db = true;
        }
    }
    if !has_db {
        return Err("invalid backup: missing data/notekeep.db".to_string());
    }

    // 关闭当前 SQLite 连接，释放文件锁
    {
        let mut guard = db.conn.lock().map_err(|e| e.to_string())?;
        let dummy = Connection::open_in_memory().map_err(|e| e.to_string())?;
        let old = std::mem::replace(&mut *guard, dummy);
        drop(old);
    }

    // 备份现有 data/ 到 data.bak/，失败可回滚
    let backup_dir = parent.join("data.bak");
    if data_dir.exists() {
        let _ = std::fs::remove_dir_all(&backup_dir);
        std::fs::rename(&data_dir, &backup_dir).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&parent).map_err(|e| e.to_string())?;

    // 解压：失败则回滚
    if let Err(e) = archive.extract(&parent) {
        let _ = std::fs::remove_dir_all(&data_dir);
        if backup_dir.exists() {
            let _ = std::fs::rename(&backup_dir, &data_dir);
        }
        return Err(format!("restore failed: {e}"));
    }

    let _ = std::fs::remove_dir_all(&backup_dir);

    log::info!("restore complete from {}, restarting app", path);
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let db = Db { conn: Mutex::new(conn) };
        db.init_tables().unwrap();
        db
    }

    #[test]
    fn test_create_and_get_note() {
        let db = test_db();
        let id = db.create_item(None, "Test Note", "note", None).unwrap();
        let item = db.get_item(&id).unwrap().expect("item should exist");
        assert_eq!(item.name, "Test Note");
        assert_eq!(item.item_type, "note");
        assert!(item.parent_id.is_none());
    }

    #[test]
    fn test_create_folder_and_child() {
        let db = test_db();
        let folder_id = db.create_item(None, "Folder", "folder", None).unwrap();
        let note_id = db.create_item(Some(&folder_id), "Child Note", "note", None).unwrap();
        let note = db.get_item(&note_id).unwrap().unwrap();
        assert_eq!(note.parent_id.unwrap(), folder_id);

        let children = db.list_items(Some(&folder_id), None, None).unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].id, note_id);
    }

    #[test]
    fn test_update_item_single_field() {
        let db = test_db();
        let id = db.create_item(None, "Original", "note", None).unwrap();
        db.update_item(&id, Some("Renamed"), None, None).unwrap();
        let item = db.get_item(&id).unwrap().unwrap();
        assert_eq!(item.name, "Renamed");
    }

    #[test]
    fn test_update_item_content() {
        let db = test_db();
        let id = db.create_item(None, "Note", "note", None).unwrap();
        db.update_item(&id, None, Some("# Hello\nworld"), None).unwrap();
        let item = db.get_item(&id).unwrap().unwrap();
        assert_eq!(item.content, "# Hello\nworld");
    }

    #[test]
    fn test_update_item_date() {
        let db = test_db();
        let id = db.create_item(None, "Note", "note", Some("2024-01-01")).unwrap();
        db.update_item(&id, None, None, Some("2025-12-31")).unwrap();
        let item = db.get_item(&id).unwrap().unwrap();
        assert_eq!(item.date.unwrap(), "2025-12-31");
    }

    #[test]
    fn test_delete_item() {
        let db = test_db();
        let id = db.create_item(None, "To Delete", "note", None).unwrap();
        db.delete_item(&id).unwrap();
        assert!(db.get_item(&id).unwrap().is_none());
    }

    #[test]
    fn test_delete_folder_cascades_to_children() {
        let db = test_db();
        let folder_id = db.create_item(None, "Folder", "folder", None).unwrap();
        let child_id = db.create_item(Some(&folder_id), "Child", "note", None).unwrap();
        db.delete_item(&folder_id).unwrap();
        assert!(db.get_item(&folder_id).unwrap().is_none());
        assert!(db.get_item(&child_id).unwrap().is_none());
    }

    #[test]
    fn test_nested_folder_cascade() {
        let db = test_db();
        let root = db.create_item(None, "Root", "folder", None).unwrap();
        let mid = db.create_item(Some(&root), "Mid", "folder", None).unwrap();
        let leaf = db.create_item(Some(&mid), "Leaf", "note", None).unwrap();
        db.delete_item(&root).unwrap();
        assert!(db.get_item(&root).unwrap().is_none());
        assert!(db.get_item(&mid).unwrap().is_none());
        assert!(db.get_item(&leaf).unwrap().is_none());
    }

    #[test]
    fn test_move_item() {
        let db = test_db();
        let f1 = db.create_item(None, "Folder 1", "folder", None).unwrap();
        let f2 = db.create_item(None, "Folder 2", "folder", None).unwrap();
        let note = db.create_item(Some(&f1), "Note", "note", None).unwrap();
        db.move_item(&note, Some(&f2)).unwrap();
        let item = db.get_item(&note).unwrap().unwrap();
        assert_eq!(item.parent_id.unwrap(), f2);
    }

    #[test]
    fn test_reorder_items() {
        let db = test_db();
        let a = db.create_item(None, "A", "note", None).unwrap();
        let b = db.create_item(None, "B", "note", None).unwrap();
        db.reorder_items(&[(a.clone(), 2), (b.clone(), 1)]).unwrap();
        let items = db.list_items(None, None, None).unwrap();
        let a_item = items.iter().find(|i| i.id == a).unwrap();
        let b_item = items.iter().find(|i| i.id == b).unwrap();
        assert_eq!(a_item.sort_order, 2);
        assert_eq!(b_item.sort_order, 1);
    }

    #[test]
    fn test_list_items_filter_by_date() {
        let db = test_db();
        db.create_item(None, "Note 1", "note", Some("2024-01-01")).unwrap();
        db.create_item(None, "Note 2", "note", Some("2024-06-15")).unwrap();
        let items = db.list_items(None, None, Some("2024-01-01")).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "Note 1");
    }

    #[test]
    fn test_list_items_filter_by_type() {
        let db = test_db();
        db.create_item(None, "Folder", "folder", None).unwrap();
        db.create_item(None, "Note", "note", None).unwrap();
        let notes = db.list_items(None, Some("note"), None).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].name, "Note");
        let folders = db.list_items(None, Some("folder"), None).unwrap();
        assert_eq!(folders.len(), 1);
    }

    #[test]
    fn test_search_items() {
        let db = test_db();
        let id = db.create_item(None, "UniqueSearchTerm", "note", None).unwrap();
        db.update_item(&id, None, Some("This note contains UniqueSearchTerm"), None).unwrap();
        let results = db.search_items("UniqueSearchTerm").unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].snippet.contains("UniqueSearchTerm"));
    }

    #[test]
    fn test_search_empty_query() {
        let db = test_db();
        db.create_item(None, "Any Note", "note", None).unwrap();
        let results = db.search_items("").unwrap();
        assert!(results.is_empty());
        let results = db.search_items("  ").unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_list_all_items() {
        let db = test_db();
        db.create_item(None, "Root Note", "note", None).unwrap();
        let folder = db.create_item(None, "Folder", "folder", None).unwrap();
        db.create_item(Some(&folder), "Child", "note", None).unwrap();
        let all = db.list_all_items().unwrap();
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn test_topological_sort() {
        let items = vec![
            Item { id: "b".into(), parent_id: Some("a".into()), name: "B".into(), item_type: "note".into(), date: None, content: "".into(), sort_order: 0, created_at: "".into(), updated_at: "".into() },
            Item { id: "a".into(), parent_id: None, name: "A".into(), item_type: "folder".into(), date: None, content: "".into(), sort_order: 0, created_at: "".into(), updated_at: "".into() },
            Item { id: "c".into(), parent_id: Some("b".into()), name: "C".into(), item_type: "note".into(), date: None, content: "".into(), sort_order: 0, created_at: "".into(), updated_at: "".into() },
        ];
        let sorted = topological_sort(items);
        let positions: Vec<&str> = sorted.iter().map(|i| i.id.as_str()).collect();
        let a_pos = positions.iter().position(|&x| x == "a").unwrap();
        let b_pos = positions.iter().position(|&x| x == "b").unwrap();
        let c_pos = positions.iter().position(|&x| x == "c").unwrap();
        assert!(a_pos < b_pos, "parent a before child b");
        assert!(b_pos < c_pos, "parent b before child c");
    }

    #[test]
    fn test_create_item_updates_updated_at() {
        let db = test_db();
        let id = db.create_item(None, "Note", "note", None).unwrap();
        let item = db.get_item(&id).unwrap().unwrap();
        assert!(!item.created_at.is_empty());
        assert_eq!(item.created_at, item.updated_at);
        std::thread::sleep(std::time::Duration::from_millis(1100));
        db.update_item(&id, Some("Renamed"), None, None).unwrap();
        let item = db.get_item(&id).unwrap().unwrap();
        assert_ne!(item.updated_at, item.created_at);
    }
}
