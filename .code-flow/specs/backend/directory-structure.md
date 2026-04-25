# Backend Directory Structure

## Rules
- 所有 Rust 源码放在 `src-tauri/src/`。
- 数据库操作集中在 `db.rs`，禁止在其他文件写 SQL。

## Patterns
- `lib.rs` 负责 Tauri app 初始化和 command 注册。
- `db.rs` 导出 `Db` struct 和所有 `#[tauri::command]`。
- `main.rs` 仅调用 `lib::run()`。

## Anti-Patterns
- 禁止在 `lib.rs` / `main.rs` 直接写 SQL。
