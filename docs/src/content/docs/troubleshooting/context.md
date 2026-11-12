---
title: "Context & Provider Mistakes"
description: "Common context & provider mistakes in Pyreon and how to fix them."
---

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

### A compat bail-out that compares the live props object with itself

The `*-compat` wrapper hands the SAME props object to every render of an instance, so `memo` comparing `prevProps` (that object) with `props` was always equal and returned the cached result on the component's own `useState` update — the update was silently dropped. React skips only a parent-driven render with shallow-equal props.
  - Compare a `{ ...props }` snapshot, and never skip a render with `ctx._selfUpdate` set (the wrapper sets it when the render came from the instance's own version bump). On a bail-out call `skipRemainingHooks()` so the dev hook-order check stays quiet.
  - Test: `{react,preact}-compat/src/tests/memo-and-ref-parity.test.ts`.

---

### Context-reading hooks after an `await` in an async component

`useHead`, `useContext`, `onMount` and friends must run in the synchronous part of setup. On the client, code after the first `await` has no current component, so `useHead` finds no head context and silently does nothing — `renderToString` keeps the context across the await, so SSR output looks right and only the hydrated/client-navigated page is wrong.
  - Register before awaiting with the reactive form, then fill it: `const input = signal({}); useHead(() => input()); const data = await load(); input.set(build(data))`.
  - `defineContentRoute` shipped this bug (every content page kept the layout's `<title>` after hydration). Test: `packages/zero/zero-content/src/tests/_define-content-route.test.tsx` ("head on the CLIENT").
  - **[FIXED, #4377] The resolved subtree itself lost context too.** `mount`/`hydrate` render it in a `.then()` microtask, which ran with no context owner (every descendant `useContext()` read the default; a nested `<PyreonUI>` under an async route body took itself for the root and flipped `<html data-theme>`), and the hydrate microtask also ran with the hydrating flag off (a `<Suspense>` inside replaced server content with its fallback). **Rule: any deferred mount/hydrate continuation re-enters the walk's ambient state: `runWithContextOwner(<owner>, …)`, plus `setHydrating(true)` for hydration (see `hydrateDeferredLazy`); a deferred MOUNT also runs in `batch()` and inserts relative to its placeholder's LIVE parent.** Seeing the owner makes the subtree see the enclosing `<Suspense>`: a still-loading `lazy()` in it registers and the boundary moves its content off-screen synchronously, which without a batch happened mid-`mountChild` (`insertBefore` NotFoundError, empty route on client navigation); effect-driven mounts never hit this because they already run inside the effect flush. A setup-time `parent` is also stale once the boundary is off-screen for another load. Test: `runtime-dom/src/tests/async-component-context.test.ts`.

---
