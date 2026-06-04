---
title: 'Native marker contract'
description: How nativeCompat() lets Pyreon framework components compose correctly inside react/preact/vue/solid-compat apps.
---

`nativeCompat()` from `@pyreon/core` is the contract that makes Pyreon framework components — `RouterView`, `PyreonUI`, `FormProvider`, `QueryClientProvider`, `Toaster`, and 19 others — work correctly when composed inside an app scaffolded with `--compat=react|preact|vue|solid`.

If you're a Pyreon user just consuming framework components, **you don't need to do anything** — the 24 components ship marked. This page explains what the marker is, why it exists, and when *you* might need to call it on your own helpers.

<PackageBadge name="@pyreon/core" href="/docs/core" />

## The wrapping problem

`@pyreon/{react,preact,vue,solid}-compat` ship a JSX runtime that wraps every component in `wrapCompatComponent`. The wrapper relocates the render context so React/Preact/Vue/Solid-style component bodies — which expect a fresh render frame on every state change — work inside Pyreon's mount pipeline.

This wrapping is *correct* for user-defined components written in the source framework's idiom. It is *broken* for Pyreon framework components that use Pyreon's own setup-frame primitives:

- `provide(ctx, value)` — pushes onto the global context stack expected to live for the descendant subtree's lifetime
- `onMount(fn)` / `onUnmount(fn)` — register against the current effect scope
- `effect(fn)` — subscribes to signals, re-runs on change

Inside the wrapper, the body runs in `runUntracked` *after* the wrapper's own `beginRender(ctx)` has swapped the active render context to the compat layer's. When the body calls `provide()`, the push lands on the global stack, but the wrapper's own `onUnmount` cleanup is what governs when it pops — not the user component's. The result: `provide()` writes get torn down before children mount, `effect()` re-runs lose access to live signals, `onUnmount` callbacks fire in the wrong order.

## The marker

```ts
import { nativeCompat, isNativeCompat } from '@pyreon/core'

// Tag a component:
function MyProvider(props) {
  provide(MyContext, props.value)
  return props.children
}
nativeCompat(MyProvider)

// Check if a component is tagged:
isNativeCompat(MyProvider) // true
```

`nativeCompat()` sets a `Symbol.for('pyreon:native-compat')` property on the function and returns the same reference. The four compat-mode JSX runtimes read this property in their `jsx()` implementation:

```ts
// Inside @pyreon/react-compat (and the other 3)
function jsx(type, props, key) {
  if (typeof type === 'function') {
    if (isNativeCompat(type)) {
      // Marker hit — route through h() directly, no wrapper
      return h(type, propsWithKey)
    }
    // Otherwise wrap in compat semantics
    const wrapped = wrapCompatComponent(type)
    return h(wrapped, propsWithKey)
  }
  // … DOM element handling
}
```

Marked components route through `h(type, props)` directly. Their bodies run inside Pyreon's setup frame — `provide()`, `onMount`, `onUnmount`, `effect` all behave exactly as they do in a non-compat app.

The marker uses `Symbol.for(...)` (a registry symbol) so `@pyreon/core` doesn't need to import anything from the four compat packages, and the four compat packages don't need to coordinate identity with each other. Both sides reference the symbol via the registry string `'pyreon:native-compat'`.

## Components shipped marked

24 framework components carry the marker today, across 13 packages:

| Package | Components |
|---|---|
| `@pyreon/core` | `ErrorBoundary` |
| `@pyreon/runtime-dom` | `Transition`, `TransitionGroup`, `KeepAlive` |
| `@pyreon/router` | `RouterProvider`, `RouterView`, `RouterLink` |
| `@pyreon/head` | `HeadProvider` |
| `@pyreon/query` | `QueryClientProvider`, `QueryErrorResetBoundary` |
| `@pyreon/i18n` | `I18nProvider` |
| `@pyreon/form` | `FormProvider`, `Form`, `Submit` |
| `@pyreon/permissions` | `PermissionsProvider` |
| `@pyreon/toast` | `Toaster` |
| `@pyreon/ui-core` | `PyreonUI`, `CoreProvider` |
| `@pyreon/unistyle` | `UnistyleProvider` |
| `@pyreon/styler` | `ThemeProvider` |
| `@pyreon/rocketstyle` | `Provider` |
| `@pyreon/coolgrid` | `Container`, `Row` |
| `@pyreon/elements` | `Overlay`, `OverlayContextProvider` |

Internal Provider components (`CoreProvider`, `UnistyleProvider`, `RocketstyleProvider`, `OverlayContextProvider`) are also marked even though they're `@internal` / `@deprecated`. Reason: `PyreonUI`'s JSX body still routes through the active jsx() runtime in compat-mode apps — any unmarked Provider rendered inside `PyreonUI`'s body would get wrapped, swallowing its `provide()` call before reaching descendants.

## When *you* need to mark a component

The marker is internal infrastructure for framework components. You only need it for **user-defined Pyreon-flavored helpers** that:

- Use `provide()` to publish context, AND
- Are composed inside a compat-mode app (`--compat=react|preact|vue|solid` scaffold)

```tsx
import { nativeCompat, provide, createContext, useContext } from '@pyreon/core'

const ThemeCtx = createContext<'light' | 'dark'>('light')

function ThemeProvider(props: { mode: 'light' | 'dark'; children?: unknown }) {
  provide(ThemeCtx, props.mode)
  return props.children as never
}
nativeCompat(ThemeProvider) // ← required if used in compat-mode apps

function useTheme() {
  return useContext(ThemeCtx)
}
```

Without the marker, the wrapper relocates the body's render context. `provide(ThemeCtx, props.mode)` pushes onto a context stack that's torn down before descendants mount. `useTheme()` reads the default value (`'light'`) instead of the provided one.

In a non-compat Pyreon app, the marker is a no-op — the JSX runtime never wraps user components in the first place, so the marker is never read. Calling `nativeCompat()` is safe everywhere.

## When you don't need to mark

You don't need to mark:

- **Pure-render components** without `provide()` / `onMount` / `effect` (e.g. layout components that just compose JSX, no setup-frame primitives)
- **Components in non-compat Pyreon apps** (the marker is never read; it's no-op overhead)
- **Source-framework components** in compat apps (the wrapper IS the right behavior — `useState` / Vue's `ref()` etc. depend on it)

## How the test layering catches regressions

The marker contract has two distinct failure modes, and each test layer catches a different one:

**Unit layer** (per-compat `native-marker-bypass.test.tsx`): proves the JSX-runtime structural contract. `jsx(NativeProvider, {})` returns vnode with `type === NativeProvider` (not the wrapper). Bisect-verified by removing `if (isNativeCompat(type))` from each compat's `jsx-runtime.ts` — the test fails with `expected [Function wrapped] to be [Function Native]`.

**E2E layer** (`e2e/cpa-app-compat.shared.ts`): proves the runtime contract under real-app reactivity. The cpa-app-compat fixtures navigate through `RouterView`-driven routes; when navigation re-fires `RouterView`'s effect inside an unmarked wrapper, the loader's `provide(LoaderDataContext, ...)` lands in a stale context stack and `useLoaderData()` reads `undefined`. Bisect-verified by removing `nativeCompat(RouterView)` — the posts test fails with `<main>` empty.

**Why both layers matter**: synchronous mount preserves `provide()` context even WITH the wrapper (provide() pushes onto the global context stack regardless), so a unit test that mounts a marked Provider once and reads the value will pass even if you remove the marker. The unit test catches jsx-runtime regressions; the e2e test catches multi-render-cycle regressions.

## See also

- [`@pyreon/react-compat`](/docs/react-compat) · [`@pyreon/preact-compat`](/docs/preact-compat) · [`@pyreon/vue-compat`](/docs/vue-compat) · [`@pyreon/solid-compat`](/docs/solid-compat) — the four compat layers that read the marker
- [`@pyreon/core`](/docs/core) — the `nativeCompat` / `isNativeCompat` exports and the broader context system
- Source: [`packages/core/core/src/compat-marker.ts`](https://github.com/pyreon/pyreon/blob/main/packages/core/core/src/compat-marker.ts)
- Anti-pattern: `.claude/rules/anti-patterns.md` — "Pyreon-flavored helper components in compat-mode apps without `nativeCompat()`"
