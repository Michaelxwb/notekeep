# Frontend Quality Standards

## Rules
- 禁止 any 类型（tsconfig: `"noImplicitAny": true`）。
- 组件使用函数组件，禁止 class 组件。
- 关键交互必须有明确的错误提示（`alert` 或 `console.error`）。
- `invoke` 调用必须包裹在 `try/catch` 中。

## Patterns
- 状态管理：组件内 useState + useCallback，共享状态用 Context API。
- Tauri IPC 调用统一封装在 `hooks/useNotes.ts`。
- 防抖保存：内容更新用 `setTimeout` 防抖，切换笔记时 flush 保存。
- Ref 模式：当前内容/选中 ID 用 `useRef` 避免 stale closure。

## Anti-Patterns
- 禁止在 render 中发起异步请求。
- 禁止直接修改 props。
