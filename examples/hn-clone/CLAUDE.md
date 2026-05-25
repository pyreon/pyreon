# Project

This project uses Pyreon Zero, a signal-based full-stack meta-framework. Do NOT use React patterns.

## Reactivity (Pyreon, not React)

- `signal()` not `useState`; `computed()` not `useMemo`; `effect()` not `useEffect`.
- Write signals via `signal.set(value)` or `signal.update(fn)`. Calling `signal(value)` does NOT write — it reads.
- Components run **once** at mount. Reactivity comes from signals reading themselves at use sites; the framework subscribes the surrounding DOM node, not the whole component.
- In JSX, signals auto-call: `{count}` (compiler inserts `()`). Outside JSX, call explicitly: `count()`.
- Don't destructure props (`const { x } = props` captures getters once and loses reactivity). Read `props.x` directly, or use `splitProps(props, ['x'])`.

## JSX

- `class=` not `className`; `for=` not `htmlFor`; camelCase events (`onClick`, `onMouseEnter`).
- Lists: `<For each={items} by={r => r.id}>{r => <li>...</li>}</For>`. The prop is `by` (not `key`) — JSX extracts `key` for VNode reconciliation.
- Conditionals: `<Show when={cond}>...</Show>` or accessor form `{() => cond() ? <A /> : null}`.
- `onChange` → `onInput` for keypress-by-keypress text updates.

## File-Based Routing

- `src/routes/index.tsx` → `/`
- `src/routes/about.tsx` → `/about`
- `src/routes/[id].tsx` → `/:id`
- `src/routes/_layout.tsx` → layout wrapper
- `(group)/` → route group (no URL segment)

Per-route exports: `default` (component), `loader` (server data), `guard` (nav guard), `middleware`, `meta`, `renderMode`.

## Don't reach for raw DOM APIs

- Use `useEventListener` / `useClickOutside` / `useScrollLock` from `@pyreon/hooks` instead of `addEventListener` / `removeEventListener`. The hook handles cleanup on unmount.
- For controlled state in primitives, use `useControllableState({ value, defaultValue, onChange })`.

## Don't paste React patterns

- No `useState` / `useEffect` / `useMemo` / `useCallback` / `useRef`. None of those exist.
- No `React.Fragment` — just `<></>`.
- No "children as function" trick — Pyreon supports JSX children directly.

## Commands

- `bun run dev` — dev server with HMR (signals preserve across reload)
- `bun run build` — production build
- `bun run preview` — serve build
- `bun run doctor` — checks for React patterns and other anti-patterns
