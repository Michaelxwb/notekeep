# Frontend Directory Structure

## Rules
- 组件放在 `src/components/`。
- 业务复用逻辑放在 `src/hooks/`。
- Context 放在 `src/contexts/`。

## Patterns
- `App.tsx` 是唯一根组件，持有主要状态。
- 组件按功能域命名：`Sidebar.tsx`、`Editor.tsx`、`Settings.tsx`。
- i18n 文本统一在 `src/i18n.ts` 管理。

## Anti-Patterns
- 禁止在 `src/components/` 外新建组件文件。
