/**
 * Real `@pyreon/mcp` output for the AI demo (DemoAi.tsx), recorded over
 * stdio (JSON-RPC `tools/call`) from the server this repo builds
 * (`node packages/tools/mcp/lib/index.js`, serverInfo pyreon 0.53.0),
 * 2026-11-11. Raw record: the scratchpad capture `captures-tools/ai-mcp.json`
 * (script `mcp-capture.mjs` + `ai-calls.json`). Texts are verbatim; the
 * demo only picks which lines to show.
 */
export interface McpCapture {
  /** The tool and its arguments, as sent. */
  tool: string
  args: string
  /** The snippet the tool ran on (absent for get_api). */
  file?: string
  code?: string
  /** The tool's text result, verbatim. */
  result: string
}

export const MCP_SERVER = "pyreon 0.53.0"
export const MCP_CAPTURED = "2026-11-11"

export const AI_CAPTURES: Record<'label' | 'list' | 'button' | 'api', McpCapture> = {
  label: {
    tool: "explain_reactivity",
    args: "{ filename: \"Counter.tsx\", code }",
    file: "Counter.tsx",
    code: "import { signal } from '@pyreon/reactivity'\n\nexport function Counter(props: { label: string }) {\n  const count = signal(0)\n  const { label } = props\n  return (\n    <button onClick={() => count.update((n) => n + 1)}>\n      {count()}\n      {props.label}\n      {label}\n    </button>\n  )\n}\n",
    result: "Reactivity map for Counter.tsx — 2 live · 1 baked-static · 1 footgun\n\n```\n   1 | import { signal } from '@pyreon/reactivity'\n   2 | \n   3 | export function Counter(props: { label: string }) {\n   4 |   const count = signal(0)\n   5 |   const { label } = props\n               ^ ⚠ footgun [props-destructured-body] — Destructuring `props` in the component body captures the values ONCE during setup — the compiler emits signal-driven props as getters, so the destructured locals are dead snapshots that never update when the parent rewrites them. Read `props.x` directly inside the reactive scope (JSX / effect / computed), or use `splitProps(props, ['x', ...])` to carve out a group while preserving reactivity.\n   6 |   return (\n   7 |     <button onClick={() => count.update((n) => n + 1)}>\n   8 |       {count()}\n              ^ ◆ live — live — this text re-renders whenever its signals change\n   9 |       {props.label}\n              ^ ◆ live — live — this text re-renders whenever its signals change\n  10 |       {label}\n              ^ ○ baked once — baked once into the DOM — never re-renders (no signal read here)\n  11 |     </button>\n  12 |   )\n  13 | }\n  14 | \n```\n\n⚠ 1 footgun:\n  • props-destructured-body (line 5): Destructuring `props` in the component body captures the values ONCE during setup — the compiler emits signal-driven props as getters, so the destructured locals are dead snapshots that never update when the parent rewrites them. Read `props.x` directly inside the reactive scope (JSX / effect / computed), or use `splitProps(props, ['x', ...])` to carve out a group while preserving reactivity.\n\nNote: 1 expression is baked STATIC (rendered once, never updated). If any was meant to update reactively, read a signal by CALLING it (`count()`), read `props.x` directly instead of destructuring, and keep dynamic values inside the JSX expression rather than a captured `const`.",
  },
  list: {
    tool: "validate",
    args: "{ filename: \"TodoList.tsx\", code }",
    file: "TodoList.tsx",
    code: "export function TodoList(props: { todos: { id: number; text: string }[] }) {\n  return (\n    <ul>\n      {props.todos.map((t) => <li>{t.text}</li>)}\n    </ul>\n  )\n}\n",
    result: "Found 1 issue:\n\n1. **array-map-jsx** (line 4)\n   Array.map() in JSX is not reactive in Pyreon. Use <For> for efficient keyed list rendering.\n   Current: `props.todos.map((t) => <li>{t.text}</li>)`\n   Fix: `<For each={props.todos} by={item => item.id}>\n  {(t) => <li>{t.text}</li>}\n</For>`\n   Auto-fixable: no",
  },
  button: {
    tool: "validate",
    args: "{ filename: \"Greeting.tsx\", code }",
    file: "Greeting.tsx",
    code: "import { signal } from '@pyreon/reactivity'\n\nexport function Greeting({ name }: { name: string }) {\n  const count = signal(0)\n  return <button onClick={() => count(count() + 1)}>Hi {name}: {count()}</button>\n}\n",
    result: "Found 2 issues:\n\n1. **props-destructured** (line 3)\n   Destructuring props at the component signature captures the values ONCE during setup — subsequent signal writes in the parent do not update the destructured locals. Access `props.x` directly, or use `splitProps(props, [...])` to carve out a group while preserving reactivity.\n   Current: `{ name }: { name: string }`\n   Fix: `(props: Props) => /* read props.x directly */`\n   Auto-fixable: no\n\n2. **signal-write-as-call** (line 5)\n   `count(value)` does NOT write the signal — `signal()` is the read-only callable surface and ignores its arguments. Use `count.set(value)` to assign or `count.update((prev) => …)` to derive from the previous value. Pyreon's runtime warns about this pattern in dev, but the warning fires AFTER the silent no-op.\n   Current: `count(count() + 1)`\n   Fix: `count.set(count() + 1)`\n   Auto-fixable: yes",
  },
  api: {
    tool: "get_api",
    args: "{\"package\": \"reactivity\", \"symbol\": \"signal\"}",
    result: "## @pyreon/reactivity — signal\n\n**Signature:**\n```typescript\n<T>(initialValue: T, options?: { name?: string }) => Signal<T>\n```\n\n**Usage:**\n```typescript\nconst count = signal(0)\ncount()              // 0 (subscribes to updates)\ncount.set(5)         // sets to 5\ncount.update(n => n + 1)  // 6\ncount.peek()         // 6 (does NOT subscribe)\n\n// Mutable value held in a signal:\nconst items = signal(new Map())\nitems.peek().set('a', 1)  // mutate in place — set(sameRef) would be a no-op\nitems.trigger()           // force subscribers to re-run\n```\n\n**Notes:** Create a reactive signal. The returned value is a CALLABLE FUNCTION — `count()` reads (and subscribes), `count.set(v)` writes, `count.update(fn)` derives, `count.peek()` reads without subscribing. This is NOT a `.value` getter/setter pattern (React/Vue) — Pyreon signals are functions. Writes gate on `Object.is`, so `set(sameReference)` is a no-op; when you hold a MUTABLE value and mutate it in place, `count.trigger()` force-notifies subscribers without a value change (Vue `triggerRef` semantic). Optional `{ name }` for debugging; auto-injected by `@pyreon/vite-plugin` in dev mode. See also: computed, effect, batch.\n\n**Common mistakes:**\n- `count.value` — does not exist. Use `count()` to read\n- `count = 5` — reassigning the variable replaces the signal, does not write to it. Use `count.set(5)`\n- `signal(5)` called with an argument after creation — reads and ignores the argument (dev mode warns). Use `.set(5)` to write\n- `const [val, setVal] = signal(0)` — signals are not destructurable tuples. The whole return value IS the signal\n- `{count}` in JSX — renders the signal function itself, not its value. Use `{count()}` or `{() => count()}`\n- `.peek()` inside `effect()` / `computed()` — bypasses tracking, creates stale reads. Only use `.peek()` for loop-prevention guards\n- Mutating a held object in place then `set(sameReference)` — a no-op (Object.is gate), subscribers never re-run. Prefer an immutable `set(newObject)`; if you deliberately own a mutable value, mutate then `.trigger()`\n",
  },
}
