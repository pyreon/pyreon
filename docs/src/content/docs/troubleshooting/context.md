---
title: "Context & Provider Mistakes"
description: "Common context & provider mistakes in Pyreon and how to fix them."
---

# Context & Provider Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Destructuring context values

`const { mode } = useContext(ctx)` captures the value once at setup time. If the provider uses getters (`get mode()`), destructuring evaluates the getter immediately — the value becomes static. Instead, keep the context object reference and access properties lazily: `const ctx = useContext(Ctx)` then read `ctx.mode` inside reactive scopes.

---

### Static provide for dynamic values

`provide(ctx, "dark")` captures a static value. For dynamic values (mode switching), provide an object with getters or a signal getter: `provide(ModeCtx, () => modeSignal())`.

---

### signal(newValue) to write

`signal(5)` does NOT set the value — it reads and ignores the argument. Use `signal.set(5)` or `signal.update(n => n + 1)`. Dev mode warns about this. The static detector flags any `X(value)` where `X` was declared as `const X = signal(...)` / `const X = computed(...)`.

**Detected by:** `signal-write-as-call` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### onClick=&#123;undefined&#125;

In production, `undefined` gets wrapped as an event listener and crashes. Always guard: `onClick={condition ? handler : undefined}` is safe (runtime bails on non-functions), but `onClick={maybeUndefined}` from props needs checking.

**Detected by:** `on-click-undefined` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Pyreon-flavored helper components in compat-mode apps without `nativeCompat()`

Compat-mode JSX runtimes (`@pyreon/{react,preact,vue,solid}-compat`) wrap every user component in `wrapCompatComponent` to relocate the render context — that's how React/Preact/Vue/Solid-style state semantics work inside Pyreon's mount pipeline. **Pyreon-flavored components that use `provide()` / `onMount()` / `onUnmount()` / `effect()` at body scope break under that wrapping** because their setup runs inside the wrapper's accessor, not inside Pyreon's setup frame. `provide()` lands in a torn-down context stack, `effect()` re-runs lose live-signal access. **Fix**: call `nativeCompat(MyHelper)` from `@pyreon/core` after the function declaration. The marker tells compat jsx() runtimes to route the component through `h(type, props)` directly. The 24 framework components shipped marked already (RouterView, PyreonUI, FormProvider, …) — this rule is for USER-defined Pyreon-flavored helpers in compat-scaffolded apps. Reference: `packages/core/core/src/compat-marker.ts`. The bug is invisible in unit tests (synchronous mount preserves provide() context even with the wrapper) but surfaces under multi-render-cycle scenarios — signal change re-fires the wrapper's accessor → `provide()` in re-run lands in stale stack. PR #427's cpa-app-compat e2e gate is the regression catcher.

---
