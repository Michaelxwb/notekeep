# Backend Database

## Rules
- 所有查询必须参数化，禁止字符串拼接 SQL。
- 迁移脚本必须可回滚或可幂等。
- 使用 `rusqlite::params![]` 进行参数化查询。

## Patterns
- SQLite 数据目录：`~/.notekeep/data/`
- 图片存储：相对路径 `images/<uuid>.<ext>`，通过 `get_image_base64` 返回 data URL。
- FTS5 search 使用 `snippet()` 函数生成高亮摘要。

## Anti-Patterns
- 禁止在事务内发起外部网络调用。
- 禁止硬编码数据库路径，使用 `dirs::home_dir()` + `.notekeep/data`。
