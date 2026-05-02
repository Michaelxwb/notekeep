~~# Tasks: NoteKeep 跨平台笔记软件

- **Source**: .code-flow/tasks/2026-04-24/notekeep.design.md
- **Created**: 2026-04-24
- **Updated**: 2026-04-24

## Proposal

NoteKeep 是一款轻量、跨平台、界面简洁的本地笔记软件，使用 Rust (Tauri) + React 技术栈开发。核心功能包括：MD 编辑器（TipTap）、类 Word 工具栏、文件/文件夹管理、按天日记、全文搜索（SQLite FTS5）、图片粘贴、拖拽排序、悬浮目录导航。

---

## TASK-001: 项目初始化

- **Status**: done
- **Priority**: P0
- **Depends**: -
- **Source**: notekeep.design.md#方案选型

### Description

初始化 Tauri 2.x + React + Vite 项目，配置 Rust 依赖（rusqlite、serde、chrono、uuid）和前端依赖（React 18、TipTap、@dnd-kit、react-day-picker、date-fns）。

### Checklist

- [x] 创建 Tauri 2.x 项目：`npm create tauri-app`
- [x] 选择 React + TypeScript 模板
- [x] 配置 Cargo.toml 依赖：rusqlite, serde, serde_json, chrono, uuid, base64
- [x] 配置前端 package.json：TipTap, @dnd-kit, react-day-picker, date-fns
- [x] 验证 `cargo tauri dev` 能正常启动

### Log

- [2026-04-24] created (draft)
- [2026-04-24] started (in-progress)
- [2026-04-24] completed (done)

---

## TASK-002: 数据库层实现

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-001
- **Source**: notekeep.design.md#数据设计

### Description

实现 SQLite 数据库初始化、items 表、images 表、FTS5 虚拟表的创建，以及数据库连接管理。

### Checklist

- [ ] 实现 `src-tauri/src/db.rs`：数据库初始化和连接管理
- [ ] 创建 items 表：id, parent_id, name, type, date, content, sort_order, created_at, updated_at
- [ ] 创建 images 表：id, note_id, filename, path, created_at
- [ ] 创建 FTS5 虚拟表 items_fts
- [ ] 创建索引：idx_items_parent, idx_items_date, idx_items_sort
- [ ] 验证数据库文件创建在 `~/.notekeep/data/notekeep.db`

### Log

- [2026-04-24] created (draft)

---

## TASK-003: Tauri Commands 实现

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-002
- **Source**: notekeep.design.md#接口设计

### Description

实现 10 个 Tauri Commands（CMD-01 到 CMD-10）：create_item、get_item、update_item、delete_item、move_item、reorder_items、list_items、search_items、save_image、get_image。

### Checklist

- [ ] 实现 CMD-01 create_item：创建文件夹或笔记
- [ ] 实现 CMD-02 get_item：获取单个 item
- [ ] 实现 CMD-03 update_item：更新 name/content/date
- [ ] 实现 CMD-04 delete_item：递归删除（含子项和关联图片）
- [ ] 实现 CMD-05 move_item：移动到其他文件夹
- [ ] 实现 CMD-06 reorder_items：批量更新 sort_order
- [ ] 实现 CMD-07 list_items：列出子项，支持按日期筛选
- [ ] 实现 CMD-08 search_items：FTS5 全文搜索
- [ ] 实现 CMD-09 save_image：保存图片到 `~/.notekeep/data/images/`
- [ ] 实现 CMD-10 get_image：获取图片 Base64
- [ ] 注册所有 commands 到 Tauri

### Log

- [2026-04-24] created (draft)

---

## TASK-004: 前端布局框架

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-001
- **Source**: notekeep.design.md#架构设计

### Description

搭建 React 前端基础布局：深色主题、顶部工具栏、左侧侧边栏（日历+文件树）、右侧编辑器面板。

### Checklist

- [ ] 配置 Tailwind CSS 深色主题（背景 #1a1a2e、文字 #eaeaea、强调色 #7c3aed）
- [ ] 实现 App 布局：顶部 Toolbar + 左侧 Sidebar + 右侧 Editor
- [ ] 实现侧边栏折叠/展开状态持久化（localStorage）
- [ ] 配置 React Router（单页面，无需路由）

### Log

- [2026-04-24] created (draft)

---

## TASK-005: 文件树组件

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-004, TASK-003
- **Source**: notekeep.design.md#FEAT-03

### Description

实现文件/文件夹管理 UI：树形结构展示、新建（文件夹/笔记）、重命名、删除、右键菜单、记住展开状态。

### Checklist

- [ ] 实现 TreeView 组件：递归渲染文件夹和笔记
- [ ] 实现右键菜单：新建文件夹、新建笔记、重命名、删除
- [ ] 实现新建文件夹/笔记弹窗
- [ ] 实现删除确认框（显示将删除的子项数量）
- [ ] 记住文件夹展开/折叠状态（localStorage）
- [ ] 调用 CMD-01/03/04/07 实现 CRUD

### Log

- [2026-04-24] created (draft)

---

## TASK-006: 日历组件

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-004
- **Source**: notekeep.design.md#FEAT-05

### Description

实现月视图日历组件，按日期筛选/创建日记，显示当天日记列表。

### Checklist

- [ ] 使用 react-day-picker 实现月视图
- [ ] 高亮显示有日记的日期
- [ ] 点击日期筛选当天日记（调用 CMD-07）
- [ ] 无日记时显示"创建今天日记"按钮
- [ ] 支持切换月份

### Log

- [2026-04-24] created (draft)

---

## TASK-007: 搜索功能

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-003, TASK-004
- **Source**: notekeep.design.md#FEAT-07

### Description

实现顶部搜索框和全文搜索功能，实时搜索（debounce 300ms）。

### Checklist

- [ ] 实现 SearchBar 组件
- [ ] 实现 debounce 300ms 的搜索逻辑
- [ ] 调用 CMD-08 search_items 获取结果
- [ ] 显示搜索结果列表（标题 + 匹配片段高亮）
- [ ] 点击结果跳转到对应笔记

### Log

- [2026-04-24] created (draft)

---

## TASK-008: TipTap 编辑器

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-004
- **Source**: notekeep.design.md#FEAT-01

### Description

集成 TipTap 富文本编辑器，支持切换编辑/预览/双屏模式，实时渲染 MD 语法。

### Checklist

- [ ] 安装 TipTap 及必要扩展：StarterKit、Placeholder
- [ ] 实现三种模式切换：编辑/预览/双屏
- [ ] 支持标准 MD 语法渲染（H1-H6、列表、代码块、引用、链接、图片）
- [ ] 实现编辑器内容状态管理
- [ ] 调用 CMD-03 更新笔记内容

### Log

- [2026-04-24] created (draft)

---

## TASK-009: 顶部工具栏

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-008
- **Source**: notekeep.design.md#FEAT-02

### Description

实现类 Word 工具栏：字体选择、字号选择（H1-H6 + 正文）、加粗、斜体、下划线、删除线、对齐、列表、引用、代码块、插入图片/链接。

### Checklist

- [ ] 实现 Toolbar 组件布局
- [ ] 实现字体选择下拉（预设几种字体）
- [ ] 实现字号选择（H1-H6 + 正文）
- [ ] 实现文本格式化按钮：加粗、斜体、下划线、删除线
- [ ] 实现对齐按钮：左对齐、居中、右对齐
- [ ] 实现列表按钮：有序列表、无序列表
- [ ] 实现块级按钮：引用、代码块
- [ ] 实现插入按钮：插入图片、插入链接

### Log

- [2026-04-24] created (draft)

---

## TASK-010: 图片粘贴功能

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-003, TASK-008
- **Source**: notekeep.design.md#FEAT-06

### Description

监听 paste 事件检测图片，保存到 `~/.notekeep/data/images/`，在 MD 中插入相对路径引用。

### Checklist

- [ ] 监听编辑器 paste 事件
- [ ] 检测剪贴板中的图片（PNG/JPG/GIF）
- [ ] 验证图片大小 ≤ 10MB
- [ ] 调用 CMD-09 save_image 保存图片
- [ ] 在光标位置插入 `![](images/uuid.png)` 格式
- [ ] 异常处理：非图片内容正常粘贴

### Log

- [2026-04-24] created (draft)

---

## TASK-011: 纯文本粘贴

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-008
- **Source**: notekeep.design.md#FEAT-08

### Description

粘贴富文本时自动清除格式，仅保留纯文本（保留换行符）。

### Checklist

- [ ] 监听 paste 事件
- [ ] 提取 event.clipboardData.getData('text/plain')
- [ ] 替换当前选区内容
- [ ] 保留换行符
- [ ] 验证：粘贴带格式文本时仅粘贴纯文本

### Log

- [2026-04-24] created (draft)

---

## TASK-012: 拖拽排序

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-005
- **Source**: notekeep.design.md#FEAT-04

### Description

使用 @dnd-kit 实现拖拽排序，支持文件夹和笔记的拖拽，持久化 sort_order。

### Checklist

- [ ] 安装 @dnd-kit/core 和 @dnd-kit/sortable
- [ ] 实现 SortableItem 组件
- [ ] 实现拖拽逻辑：同层级项可拖拽排序
- [ ] 调用 CMD-06 reorder_items 保存排序
- [ ] 验证拖拽后刷新列表

### Log

- [2026-04-24] created (draft)

---

## TASK-013: 自动保存

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-008, TASK-003
- **Source**: notekeep.design.md#RULE-03

### Description

实现停止输入 1 秒后自动保存（debounce），调用 CMD-03 update_item。

### Checklist

- [ ] 实现 debounce 1s 的保存逻辑
- [ ] 编辑器内容变化时重置计时器
- [ ] 调用 CMD-03 保存笔记内容
- [ ] 保存失败时提示用户重试
- [ ] 添加手动保存快捷键 Ctrl+S

### Log

- [2026-04-24] created (draft)

---

## TASK-014: 悬浮目录

- **Status**: done
- **Priority**: P1
- **Depends**: TASK-008
- **Source**: notekeep.design.md#FEAT-09

### Description

编辑器右侧悬浮目录导航，显示 H1-H6 标题层级，点击跳转，5 秒无操作自动隐藏，滚动时自动出现。

### Checklist

- [ ] 解析编辑器内容中的 H1-H6 标题
- [ ] 实现悬浮目录组件（固定在右侧）
- [ ] 点击目录项跳转到对应位置
- [ ] 实现 5 秒无操作自动隐藏
- [ ] 监听滚动事件，滚动时显示

### Log

- [2026-04-24] created (draft)

---

## TASK-015: 构建打包

- **Status**: done
- **Priority**: P0
- **Depends**: TASK-010, TASK-011, TASK-012, TASK-013
- **Source**: notekeep.design.md#部署架构

### Description

使用 cargo tauri build 生成安装包（Windows .exe/.msi、macOS .dmg、Linux .AppImage）。

### Checklist

- [x] 运行 `cargo tauri build`
- [x] 生成 Windows 安装包
- [x] 生成 macOS 安装包
- [x] 生成 Linux 安装包
- [x] 验证安装包可正常启动

### Log

- [2026-04-24] created (draft)
- [2026-05-02] completed (done)

---

## 依赖链

```
TASK-001 (项目初始化)
    ├── TASK-002 (数据库层) ─────────────────┐
    └── TASK-004 (前端布局)                  │
            ├── TASK-005 (文件树) ◄──────────┤
            ├── TASK-006 (日历)              │
            └── TASK-008 (编辑器) ◄──────────┤
                    ├── TASK-009 (工具栏)    │
                    ├── TASK-010 (图片粘贴) ─┤
                    ├── TASK-011 (纯文本粘贴)─┤
                    ├── TASK-013 (自动保存) ─┤
                    └── TASK-014 (悬浮目录)   │
            └── TASK-007 (搜索) ◄────────────┘

TASK-003 (Commands) ◄───────────────────────┘

TASK-012 (拖拽排序) ◄── TASK-005

TASK-015 (构建打包) ◄── TASK-010, TASK-011, TASK-012, TASK-013
```

---

## 建议执行顺序

1. TASK-001 (无依赖) — 项目初始化 ✅
2. TASK-002 (依赖: TASK-001) — 数据库层
3. TASK-003 (依赖: TASK-002) — Commands
4. TASK-004 (依赖: TASK-001) — 前端布局
5. TASK-006 (依赖: TASK-004) — 日历
6. TASK-008 (依赖: TASK-004) — 编辑器
7. TASK-005 (依赖: TASK-004, TASK-003) — 文件树
8. TASK-007 (依赖: TASK-003, TASK-004) — 搜索
9. TASK-009 (依赖: TASK-008) — 工具栏
10. TASK-010 (依赖: TASK-003, TASK-008) — 图片粘贴
11. TASK-011 (依赖: TASK-008) — 纯文本粘贴
12. TASK-013 (依赖: TASK-008, TASK-003) — 自动保存
13. TASK-012 (依赖: TASK-005) — 拖拽排序
14. TASK-014 (依赖: TASK-008) — 悬浮目录
15. TASK-015 (依赖: TASK-010, TASK-011, TASK-012, TASK-013) — 构建打包~~
