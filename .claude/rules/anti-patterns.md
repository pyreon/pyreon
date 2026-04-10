# Anti-Patterns

## Reactivity Mistakes

- **Bare signal in JSX text**: `{count()}` → wrap in `{() => count()}` or let the compiler handle it
- **Stale closures**: `signal.peek()` captured in long-lived closures loses reactivity
- **Missing batch**: 3+ signal updates without `batch()` → unnecessary re-renders
- **Nested effects**: `effect()` inside `effect()` → use `computed()` for derived values
- **Signals in hot paths**: Creating signals inside render functions or loops → create once at component setup
- **Reading `.peek()` in effects/computeds**: Bypasses tracking, creates stale reads
- **Destructuring props**: `const { state } = props` captures getter values once — loses reactivity. Use `props.state` directly, or `splitProps(props, ['state'])` for rest patterns

## JSX Mistakes

- **`key` on `<For>`**: Use `by` not `key` — JSX reserves `key` for VNode reconciliation
- **`.map()` in JSX**: Use `<For>` for reactive list rendering, not `.map()`
- **`className`/`htmlFor`**: Use `class` and `for` — standard HTML attributes
- **`onChange` on inputs**: Use `onInput` for keypress-by-keypress updates (native DOM events)
- **Ternary for conditionals**: Use `<Show>` for signal-driven conditions (more efficient)
- **Wrapping signal reads in String()**: `{String(count())}` is unnecessary — `{count()}` works directly in JSX text, numbers auto-coerce. The compiler wraps signal reads reactively regardless.
- **Function accessors for dimension props**: `state={() => expr}` is wrong — rocketstyle dimension props (`state`, `size`, `variant`) accept string values, not function accessors. Use `state={expr}` and let the compiler handle reactivity via `_rp()` wrapping.

## Context & Provider Mistakes

- **Destructuring context values**: `const { mode } = useContext(ctx)` captures the value once at setup time. If the provider uses getters (`get mode()`), destructuring evaluates the getter immediately — the value becomes static. Instead, keep the context object reference and access properties lazily: `const ctx = useContext(Ctx)` then read `ctx.mode` inside reactive scopes.
- **Static provide for dynamic values**: `provide(ctx, "dark")` captures a static value. For dynamic values (mode switching), provide an object with getters or a signal getter: `provide(ModeCtx, () => modeSignal())`.
- **signal(newValue) to write**: `signal(5)` does NOT set the value — it reads and ignores the argument. Use `signal.set(5)` or `signal.update(n => n + 1)`. Dev mode warns about this.
- **onClick={undefined}**: In production, `undefined` gets wrapped as an event listener and crashes. Always guard: `onClick={condition ? handler : undefined}` is safe (runtime bails on non-functions), but `onClick={maybeUndefined}` from props needs checking.

## Architecture Mistakes

- **Circular imports**: Keep dependency order (reactivity → core → runtime-dom → router → server)
- **Build before dev**: Workspace resolution via `"bun"` condition means no build step needed
- **`[key: string]: unknown` catch-all**: Use `data-*/aria-*` template literal index signatures
- **Detaching methods**: `_bindText(obj.method, node)` loses `this` → compiler only emits for simple identifiers
- **Duplicate module augmentation**: When a library package (e.g., `@pyreon/ui-theme`) already augments an interface (e.g., `StylesDefault extends ITheme`), consuming apps must NOT re-augment the same interface with a different type — this causes TS2320 "cannot simultaneously extend" errors. Remove app-level `pyreon.d.ts` augmentation when the library handles it.
- **Using non-existent dimension props in demos**: Always check the component definition before using `state`, `size`, or `variant` props — if the component doesn't define that dimension (e.g., Loader has no `.variants()`), the prop is invalid and causes type errors (`never[]`).
- **`as unknown as VNodeChild` on JSX returns**: This cast is unnecessary — `JSX.Element` (VNode) is already assignable to `VNodeChild`. Never add it; remove it where found.
- **Duplicating controlled/uncontrolled pattern**: Use `useControllableState` from `@pyreon/hooks` instead of manual `isControlled + signal + getter` pattern. Every primitive had this duplicated before the fix.
- **Static return null for conditional rendering**: `if (!isActive()) return null` runs once — components run once in Pyreon. Use reactive accessor: `return (() => { if (!isActive()) return null; return <div>...</div> })`. This applies to TabPanelBase, ModalBase, and any component that conditionally renders.
- **Empty `.theme({})`**: Never chain `.theme({})` as a no-op. If a component needs no base theme, skip `.theme()` entirely.
- **`typeof process !== 'undefined'` for dev-mode warnings**: Dead code in real Vite browser bundles because Vite does not polyfill `process`. The warning fires in vitest (where `process` exists) but is silently dead in production browsers — unit tests pass while users get nothing. Use `import.meta.env.DEV` instead — Vite/Rolldown literal-replace it at build time, the prod bundle tree-shakes the warning to zero bytes, and vitest sets it to `true` automatically. Reference implementation: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`. Several existing files (`runtime-dom/src/transition.ts`, `core/core/src/lifecycle.ts`, etc.) use the broken pattern and need a separate cleanup PR.

## Testing Mistakes

- **Running `bun test`**: Use `bun run test` (runs vitest via package scripts)
- **Missing cleanup**: Always clean up mounted components, dispose effects
- **Fake timers**: Use real `setTimeout` with `await` — fake timers cause subtle issues
- **Testing internals**: Test public API behavior, not implementation details
- **DOM tests without happy-dom**: Packages with DOM need `environment: "happy-dom"` in vitest config

## Documentation Mistakes

- **Forgetting to update all surfaces**: CLAUDE.md, docs/, README, llms.txt, llms-full.txt, MCP api-reference must all stay in sync
- **Outdated examples**: Examples must compile and run — no pseudocode in docs
