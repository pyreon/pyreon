# @pyreon/vue-compat

## 0.19.0

### Minor Changes

- [#619](https://github.com/pyreon/pyreon/pull/619) [`399ac5c`](https://github.com/pyreon/pyreon/commit/399ac5c11f9a787ed6af1a94df3720cd241c06fa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - compat: close genuine missing-by-omission public APIs (near-full parity)

  Audited the four compat layers (unit 770 → 804, browser smoke 4/4, e2e
  compat-layers 12/12 all green). Added the commonly-used public APIs that
  were missing by omission (not the intentional documented limitations like
  React class setState or Vue Options API):

  - **react-compat**: `useOptimistic` (React 19) — passthrough reduced
    through pending optimistic actions; overlay clears when `passthrough`
    changes (the non-concurrent-mode equivalent of React discarding
    optimistic state when the action settles).
  - **vue-compat**: `Transition`, `TransitionGroup` (← @pyreon/runtime-dom),
    `Suspense` (← @pyreon/core), `getCurrentInstance`, `useSlots`,
    `useAttrs`; `KeepAlive` upgraded from a no-op stub to wrap the real
    @pyreon/runtime-dom `KeepAlive`.
  - **solid-compat**: `Dynamic`, `Portal` (← @pyreon/core), `render` /
    `hydrate` (← @pyreon/runtime-dom mount/hydrateRoot), `MountableElement`.

  All additions map onto existing Pyreon primitives (no new deps), ship
  with JSDoc `@example` + tests, and honestly document their compat
  limitations in the JSDoc and docs pages. Backward-compatible.

- [#625](https://github.com/pyreon/pyreon/pull/625) [`de05746`](https://github.com/pyreon/pyreon/commit/de05746863646359c223d8f8e604077da79e159b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - compat: close the cleanly-fixable fidelity gaps ([#619](https://github.com/pyreon/pyreon/issues/619) follow-up)

  The partial-fidelity shims from [#619](https://github.com/pyreon/pyreon/issues/619) that COULD be faithfully implemented
  are now real (the rest stay honestly documented as architectural limits):

  - **solid-compat `Portal`**: `useShadow` → dedicated `<div>` host + open
    shadow root; `isSVG` → SVG-namespaced `<g>` host; children render into
    the host; host removed on unmount via `onCleanup` (no detached-host
    leak). No `@pyreon/core` change.
  - **vue-compat `useAttrs()` / `getCurrentInstance().attrs`**: now compute
    the Vue declared-vs-fallthrough split when `defineComponent({ props })`
    is used; full props object only when no props were declared.
  - **vue-compat `getCurrentInstance().emit`**: now provided — invokes the
    matching `on{Event}` prop handler.

  Backward-compatible. Verified: unit 804 → 811, solid browser 2 → 4,
  e2e compat-layers 12/12, typecheck clean.

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/runtime-dom@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0

## 0.14.0

### Minor Changes

- [#291](https://github.com/pyreon/pyreon/pull/291) [`9e81660`](https://github.com/pyreon/pyreon/commit/9e81660481af0cf49d245e008ab17a30eaf5b8ed) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Production-ready Vue 3 Composition API surface with 144 tests. Adds deep recursive readonly, isReactive/isReadonly/isProxy/markRaw, effectScope/getCurrentScope/onScopeDispose, watch with array source, onErrorCaptured/onRenderTracked/onRenderTriggered, Teleport/KeepAlive, watchPostEffect/watchSyncEffect, customRef, createApp.use()/provide(), version string, and 8 type exports (PropType, ExtractPropTypes, EmitsOptions, SetupContext, Plugin, Directive, InjectionKey, Component/VNode).

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/runtime-dom@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/runtime-dom@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/runtime-dom@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2
  - @pyreon/runtime-dom@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1
  - @pyreon/runtime-dom@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0
  - @pyreon/runtime-dom@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/runtime-dom@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7
  - @pyreon/runtime-dom@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/runtime-dom@0.5.6
  - @pyreon/reactivity@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4
  - @pyreon/runtime-dom@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3
  - @pyreon/runtime-dom@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2
  - @pyreon/runtime-dom@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/reactivity@0.5.1
  - @pyreon/runtime-dom@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
  - @pyreon/runtime-dom@0.5.0
  - @pyreon/reactivity@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0
  - @pyreon/runtime-dom@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1
  - @pyreon/runtime-dom@0.3.1

## 0.3.0

### Minor Changes

- ### Performance

  - **2x faster signal creation** — removed `Object.defineProperty` that forced V8 dictionary mode
  - **Event delegation** — `el.__ev_click` instead of `addEventListener` for compiled templates
  - **`_bindText`** — direct signal→TextNode subscription with zero effect overhead
  - **`_bindDirect`** — single-signal attribute bindings bypass effect tracking entirely
  - **`signal.direct()`** — flat-array updater registration for compiler-emitted DOM bindings
  - **Batch Set pooling** — snapshot-free subscriber notification eliminates array allocations
  - **`createSelector` snapshot-free** — O(1) selection without copying subscriber maps
  - **`renderEffect` fast path** — lighter than full `effect()` for DOM bindings
  - **SSR `renderToString` micro-optimizations** — sequential loops, `for...in`, `escapeHtml` fast path
  - **Hydration optimizations** — reduced overhead during island hydration
  - **Nested `_tpl` support** — compiler emits nested `cloneNode(true)` templates

  ### Features

  - **True React compatibility** — `useState`, `useEffect`, `useMemo` with re-render model matching React semantics
  - **True Preact compatibility** — hooks with re-render model matching Preact semantics
  - **True Vue compatibility** — `ref`, `reactive`, `watch`, `computed` with re-render model matching Vue semantics
  - **True SolidJS compatibility** — signals with re-render model matching Solid semantics, children helper fixes

  ### Benchmark Results (Chromium)

  Pyreon (compiled) is fastest framework on 6 of 7 tests:

  - Create 1,000 rows: 9ms (1.00x) vs Solid 10ms, Vue 11ms, React 33ms
  - Replace all rows: 10ms (1.00x) vs Solid 10ms, Vue 11ms, React 31ms
  - Partial update: 5ms (1.00x) vs Solid 6ms, Vue 7ms, React 6ms
  - Select row: 5ms (1.00x) — tied with all signal frameworks
  - Create 10,000 rows: 103ms (1.00x) vs Solid 122ms, Vue 136ms, React 540ms

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.0
  - @pyreon/core@0.3.0
  - @pyreon/runtime-dom@0.3.0

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/reactivity@0.2.1
  - @pyreon/core@0.2.1
  - @pyreon/runtime-dom@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0
  - @pyreon/core@0.2.0
  - @pyreon/runtime-dom@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2
  - @pyreon/runtime-dom@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
  - @pyreon/runtime-dom@0.1.1
