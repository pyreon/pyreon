# Anti-Patterns

## Reactivity Mistakes
- **Bare signal in JSX text**: `{count()}` → wrap in `{() => count()}` or let the compiler handle it
- **Stale closures**: `signal.peek()` captured in long-lived closures loses reactivity
- **Missing batch**: 3+ signal updates without `batch()` → unnecessary re-renders
- **Nested effects**: `effect()` inside `effect()` → use `computed()` for derived values
- **Signals in hot paths**: Creating signals inside render functions or loops → create once at component setup
- **Reading `.peek()` in effects/computeds**: Bypasses tracking, creates stale reads

## JSX Mistakes
- **`key` on `<For>`**: Use `by` not `key` — JSX reserves `key` for VNode reconciliation
- **`.map()` in JSX**: Use `<For>` for reactive list rendering, not `.map()`
- **`className`/`htmlFor`**: Use `class` and `for` — standard HTML attributes
- **`onChange` on inputs**: Use `onInput` for keypress-by-keypress updates (native DOM events)
- **Ternary for conditionals**: Use `<Show>` for signal-driven conditions (more efficient)

## Architecture Mistakes
- **Circular imports**: Keep dependency order (reactivity → core → runtime-dom → router → server)
- **Build before dev**: Workspace resolution via `"bun"` condition means no build step needed
- **`[key: string]: unknown` catch-all**: Use `data-*/aria-*` template literal index signatures
- **Detaching methods**: `_bindText(obj.method, node)` loses `this` → compiler only emits for simple identifiers

## Testing Mistakes
- **Running `bun test`**: Use `bun run test` (runs vitest via package scripts)
- **Missing cleanup**: Always clean up mounted components, dispose effects
- **Fake timers**: Use real `setTimeout` with `await` — fake timers cause subtle issues
- **Testing internals**: Test public API behavior, not implementation details
- **DOM tests without happy-dom**: Packages with DOM need `environment: "happy-dom"` in vitest config

## Documentation Mistakes
- **Forgetting to update all surfaces**: CLAUDE.md, docs/, README, llms.txt, llms-full.txt, MCP api-reference must all stay in sync
- **Outdated examples**: Examples must compile and run — no pseudocode in docs
