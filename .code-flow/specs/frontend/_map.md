# Frontend Retrieval Map

> AI 导航地图：帮助快速定位前端代码结构和关键模块。

## Purpose

基于 React 19 + Tauri 2 的跨平台笔记应用，负责用户交互、数据展示和 Tauri IPC 调用。

## Architecture

- Framework: React 19 + TypeScript
- State: React useState/useCallback + Context API (useLanguage)
- Styling: Tailwind CSS 4 + CSS custom properties
- Build: Vite 8
- Tauri: 2.x (Rust WebView 混合应用)
- Editor: @tiptap/react (富文本), marked (markdown 渲染)
- DnD: @dnd-kit/core + @dnd-kit/sortable
- Date: date-fns + react-day-picker

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | 根组件，状态管理，IPC 调用入口 |
| `src/main.tsx` | 应用入口，挂载 LanguageProvider |
| `src/hooks/useNotes.ts` | 所有 Tauri invoke 调用的封装 hook |
| `src/contexts/LanguageContext.tsx` | i18n Context + localStorage 持久化 |
| `src/i18n.ts` | 中英文翻译映射表 (translations) |

## Module Map

```
src/
├── components/
│   ├── Sidebar.tsx       # 侧边栏，Notes/Diary Tab，文件夹树，拖拽排序
│   ├── Editor.tsx       # Markdown 编辑器，三视图模式 (edit/split/preview)
│   ├── TableOfContents  # 标题导航
│   ├── DragSortable.tsx # @dnd-kit 排序包装
│   ├── ContextMenu.tsx  # 右键菜单
│   ├── Dialog.tsx       # 通用确认弹窗
│   └── Settings.tsx     # 设置弹窗（语言/导入导出）
├── contexts/
│   └── LanguageContext.tsx  # i18n provider
├── hooks/
│   └── useNotes.ts      # 所有 Tauri invoke CRUD 封装
├── i18n.ts              # 中英文翻译表
└── index.css            # Tailwind + 全局样式
```

## Data Flow

```
用户操作
  ↓
React 事件处理 (useCallback)
  ↓
Tauri invoke (useNotes hook)
  ↓
Rust command handler (lib.rs)
  ↓
db.rs (rusqlite) ←→ SQLite
        ↕
     FTS5 search
  ↓
返回 JSON 到前端
  ↓
React 状态更新 → 组件重渲染
```

## Navigation Guide

- 新增组件 → `src/components/`
- IPC/后端调用 → `src/hooks/useNotes.ts`
- i18n 文本 → `src/i18n.ts` 添 key，`useLanguage().t()` 调用
- 样式 → `src/index.css`（Tailwind @theme + ProseMirror 样式）
