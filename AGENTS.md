# Project Guidelines

## Team Identity
- Team: NoteKeep
- Project: NoteKeep (跨平台笔记应用)
- Language: TypeScript (frontend) + Rust (backend)

## Core Principles
- All changes must include tests
- Single responsibility per function (<= 50 lines)
- No loose typing or silent exception handling
- Handle errors explicitly

## Forbidden Patterns
- Hard-coded secrets or credentials
- Unparameterized SQL
- Network calls inside tight loops

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 |
| Backend | Tauri 2.x (Rust) + rusqlite (bundled SQLite) |
| Editor | @tiptap/react + marked |
| Search | SQLite FTS5 |
| i18n | React Context + localStorage |

## Build Requirements

- **TypeScript**: strict 模式 + noUnusedLocals + noUnusedParameters（tsconfig.app.json）
- **Rust**: 最低版本 1.77.2（rust-version in Cargo.toml）
- **CI**: PR 必须通过三平台构建（macOS / Ubuntu / Windows）才能发布

## Spec Loading
This project uses the code-flow two-tier spec system.

**Two-tier architecture**:
- **Tier 0 `_map.md`（导航地图）**：项目结构、关键文件、数据流。你手动读取，帮助理解代码在哪里。
- **Tier 1 约束规范**：编码规则、模式、反模式。由 Hook 根据文件路径标签自动注入，你无需手动加载。

**Your responsibility**:
1. Determine domain from the question:
   - **frontend**: components, pages, hooks, styles, UI, .tsx/.jsx/.css
   - **backend**: Rust/Tauri, db.rs, Cargo.toml, .rs files
2. Read `.code-flow/specs/<domain>/_map.md` for navigation context
3. Constraint specs are auto-injected by PreToolUse Hook when you edit code — do NOT manually read them
4. If question spans multiple domains, read all matching `_map.md` files
5. If no domain matches, skip spec loading

Do NOT ask the user which specs to load — the system handles constraint injection automatically.

## Task Documents (cf-task workflow)

- `.code-flow/specs/shared/` holds PRD/design templates used by `/cf-task:prd` and `/cf-task:align`
- Workflow: `/cf-task:prd` → `.prd.md` → `/cf-task:align <.prd.md>` → `.design.md` → `/cf-task:plan <.design.md>` → tasks
- Templates are read by the commands themselves; you do not need to pre-load them