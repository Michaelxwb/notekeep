# Backend Database

## Rules
- 所有查询必须参数化，禁止字符串拼接 SQL。
- 迁移脚本必须可回滚或可幂等。
- 使用 `rusqlite::params![]` 进行参数化查询。

## Patterns
- SQLite 数据目录：`~/.notekeep/data/`
- 图片存储：相对路径 `images/<uuid>.<ext>`，通过 `get_image_base64` 返回 data URL。
- FTS5 search 使用 `snippet()` 函数生成高亮摘要。
- FTS5 使用 trigram tokenizer，支持 CJK 子串搜索；短查询（<3 字符）自动回退到 LIKE 搜索。
- delete_item 先收集所有图像路径，再删除 DB 记录，最后删除文件（失败可重试，不留孤儿文件）。
- 导入使用拓扑排序保证父节点先于子节点插入。
- 备份使用 `VACUUM INTO` 生成干净副本。
- 恢复先备份到 `data.bak/`，解压失败时回滚。

## Anti-Patterns
- 禁止在事务内发起外部网络调用。
- 禁止硬编码数据库路径，使用 `dirs::home_dir()` + `.notekeep/data`。
