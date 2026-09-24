---
title: "Context & Provider Mistakes"
description: "Common context & provider mistakes in Pyreon and how to fix them."
---

# Context & Provider Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### A component reading context bare while sibling hooks use a fallback

Route every consumer of a context+singleton pair through one resolver.
  - `@pyreon/router` hooks and `RouterLinkImpl` resolve through `getActiveRouter()` (context, then the active router). A bare `useContext` read made `<RouterLink>` render a `#/path` href and swallow clicks after `setActiveRouter(router)` with no provider.
  - A component that cannot resolve its dependency degrades to native behaviour (plain `href`, unintercepted click, dev warning). Guard-bails run before `preventDefault()`.
  - Test: `packages/core/router/src/tests/link-dx.test.ts`.

---

### Destructuring context values

`const { mode } = useContext(ctx)` fires provider getters once. Keep the object and read `ctx.mode` inside reactive scopes.

---

### Static provide for dynamic values

`provide(ctx, "dark")` is static. Provide an object with getters or an accessor: `provide(ModeCtx, () => modeSignal())`.

---

### signal(newValue) to write

`signal(5)` reads and ignores the argument. Use `signal.set(5)` or `signal.update(n => n + 1)`. Dev mode warns; the detector flags `X(value)` where `X` is a `signal(...)`/`computed(...)` const.

**Detected by:** `signal-write-as-call` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### onClick=&#123;undefined&#125;

A nullish handler is legal and ignored (`applyEventProp` in `runtime-dom/src/props.ts` returns early for non-functions and warns only for wrong types).
  - `onClick={cond ? handler : undefined}` is the intended pattern.
  - The risk is a silent dead control when a handler you expected is `undefined`. The detector flags only the literal `onClick={undefined}` (omit the attribute instead).

**Detected by:** `on-click-undefined` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Pyreon-flavored helper components in compat-mode apps without `nativeCompat()`

The `*-compat` JSX runtimes wrap user components in `wrapCompatComponent`, so a helper using `provide()` / `onMount()` / `onUnmount()` / `effect()` at body scope runs outside Pyreon's setup frame and breaks on re-render.
  - Call `nativeCompat(MyHelper)` from `@pyreon/core` (`core/src/compat-marker.ts`) so compat runtimes route it through `h()`. Framework components (`RouterView`, `PyreonUI`, `FormProvider`, …) are already marked.
  - Unit tests cannot see this (a single synchronous mount keeps context); the cpa-app-compat e2e suites (`e2e/cpa-app-*-compat.spec.ts`) catch it.

---
