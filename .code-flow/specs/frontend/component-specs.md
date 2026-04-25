# Component Specs

## Rules
- Props 使用 interface 定义。
- 组件文件名与组件名一致。

## Patterns
- 组件拆分为 UI 与容器层，避免单文件过大。
- 编辑器三视图：`viewMode: 'edit' | 'split' | 'preview'`，通过 `EditorHandle` 暴露 `insertContent` / `getContent`。
- Sidebar 使用 `useMemo` 计算 `rootFolders`、`diaryMonthGroups` 等派生数据。

## Anti-Patterns
- 禁止在组件内直接修改 props。
- 禁止在 JSX 中直接使用 `.map()` 之外的循环，应使用 `forEach` + 累积模式。
