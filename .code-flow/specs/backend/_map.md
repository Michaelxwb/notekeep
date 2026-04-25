# Backend Retrieval Map

> AI 导航地图：帮助快速定位 Rust 后端代码结构和关键模块。

## Purpose

基于 Tauri 2.x (Rust) 的本地数据层，负责 SQLite 数据库操作、文件管理和数据导入导出。

## Architecture

- Framework: Tauri 2.x (Rust)
- ORM/DB: rusqlite (bundled, in-process SQLite)
- Database: SQLite with FTS5 virtual table for full-text search
- Image storage: Disk (`.notekeep/data/images/`)
- Auth: None (local-only app)
- Serialization: serde + serde_json

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | Tauri app 初始化，command handler 注册 |
| `src-tauri/src/db.rs` | 所有数据库操作 (CRUD + FTS + 图像) |
| `src-tauri/src/main.rs` | Rust 入口，调用 lib::run() |
| `src-tauri/Cargo.toml` | Rust 依赖管理 |

## Module Map

```
src-tauri/src/
├── lib.rs          # Tauri Builder 注册所有 command
├── db.rs           # Db struct + 所有 SQL 操作 + Tauri command 导出
└── main.rs         # 入口，调用 run()
```

## Data Flow

```
Frontend (invoke)
  ↓
lib.rs: tauri::generate_handler![...]
  ↓
db.rs: pub fn command(...)
  ↓
rusqlite Connection
  ↓
SQLite file (.notekeep/data/notekeep.db)
     + FTS5 virtual table (items_fts)
     + images table
     + disk images/ directory
```

## Navigation Guide

- 新增 command → 在 `db.rs` 添加 `pub fn` + `#[tauri::command]`，在 `lib.rs` 引入并注册
- 数据库表变更 → `db.rs` 的 `init_tables()` 方法
- 图像处理 → `db.rs` 的 `save_image` / `get_image` / `get_image_base64`
- 导入导出 → `db.rs` 的 `export_data` / `import_data`
