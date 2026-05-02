# Backend Code Quality & Performance

## Rules
- 关键路径必须有结构化日志（使用 `log::info!` / `log::error!`）。
- 所有 `Result` 必须用 `map_err(|e| e.to_string())` 转为 `String` 传给前端。
- 图片存储路径：`images/<uuid>.<ext>`

## Patterns
- 使用 `thiserror` 定义自定义错误类型。
- `Db` 使用 `std::sync::Mutex<Connection>` 实现线程安全。
- 删除操作递归处理子节点（`delete_item` 调用自身）。
- 导入数据使用拓扑排序保证父节点先于子节点插入。

## Anti-Patterns
- 禁止在请求链路中吞掉异常。
- 禁止在锁持有期间执行耗操作（数据库操作须快速）。
