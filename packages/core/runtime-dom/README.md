# @pyreon/runtime-dom

Surgical signal-to-DOM renderer — no virtual DOM, no diff.

Mounts VNode trees and compiler-emitted `_tpl()` cloneNode templates directly into the DOM; per-node `_bind()` calls produce surgical signal-to-DOM updates without VDOM diffing. Reactive text uses `TextNode.data` (not `.textContent`) for minimal mutation; SVG / MathML namespaces are auto-detected (67 tags); custom elements receive props as properties. Ships CSS-transition support (`<Transition>` / `<TransitionGroup>`) and component caching (`<KeepAlive>`) — each also available as a subpath export so apps that don't use animations or caching can tree-shake them out.

## Install

```bash
bun add @pyreon/runtime-dom @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import { mount, hydrateRoot, Transition, KeepAlive } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { Show } from '@pyreon/core'

const count = signal(0)

function App() {
  return (
    <button onClick={() => count.update(n => n + 1)}>
      Clicks: {() => count()}
    </button>
  )
}

const unmount = mount(<App />, document.getElementById('app')!)
// Or hydrate SSR-rendered markup:
hydrateRoot(<App />, document.getElementById('app')!)
```

## mount / render / unmount

```ts
const unmount = mount(<App />, container)
unmount()                                // teardown effects, unmount subtree
```

`render` is an alias for `mount` (Solid-parity). `mountChild(child, parent, anchor)` is the low-level form for advanced integrations.

## Hydration

```ts
import {
  hydrateRoot, enableHydrationWarnings, disableHydrationWarnings, onHydrationMismatch,
} from '@pyreon/runtime-dom'

hydrateRoot(<App />, container)

enableHydrationWarnings()                  // dev console warnings on mismatch
onHydrationMismatch((ctx) => {
  // ctx: { type, node, expected, received, path }
  reportToTelemetry(ctx)
})
```

The `_tpl` hydration path uses a framework-wide correctness-first SWAP: when the SSR DOM doesn't match the freshly-built template, the SSR subtree is replaced with the rebuilt one (same final DOM byte-for-byte for matched cases; correct DOM for mismatches without a crash). Reactivity survives across the swap.

## applyProp / applyProps

```ts
applyProp(el, 'class', { active: isActive() })   // cx-normalized
applyProp(el, 'style', { color: 'red' })
applyProp(el, 'onClick', handler)
applyProps(el, { class: 'btn', 'data-id': id })
```

The `class` prop accepts strings, arrays, objects, or any nested mix — normalized via `cx()` from `@pyreon/core`. Event handlers may go through the delegation path (`DELEGATED_EVENTS` allowlist + `setupDelegation`) instead of `addEventListener` for common bubbling events.

## HTML sanitization

```ts
import { sanitizeHtml, setSanitizer } from '@pyreon/runtime-dom'

setSanitizer((html) => DOMPurify.sanitize(html))
sanitizeHtml('<script>…</script>') // routes through the active sanitizer
```

Used by `innerHTML` / `dangerouslySetInnerHTML` paths. Default sanitizer is a conservative pass-through — install `DOMPurify` or equivalent for production.

## SVG / MathML / custom elements

- **SVG / MathML** tags (67 detected) are auto-created via `createElementNS` with the correct namespace URI.
- **SVG attribute application** ALWAYS uses `setAttribute()` (never property assignment) — many SVG properties (`SVGRectElement.x`, `SVGMarkerElement.refX`, etc.) are read-only `SVGAnimatedLength` getters and would crash on property write.
- **Custom elements** (tag name with hyphen) receive props as properties, not attributes — matches React/Vue/Solid convention.

## Templates

```ts
const template = createTemplate('<div class="card"><h1></h1><p></p></div>')
const el = template() // cloneNode under the hood
```

`createTemplate(html)` is the user-facing reusable cloneNode factory. The compiler-emitted `_tpl(html)` is the same primitive — emitted automatically for any JSX element tree with ≥1 DOM tag.

## Compiler-emitted runtime helpers

These symbols are emitted by `@pyreon/compiler`. Not for hand-written user code, but documented here as the contract:

| Symbol | Purpose |
|---|---|
| `_tpl(html)` | Parse + clone an HTML template once per literal |
| `_bindText(source, textNode)` | Reactive text — reads `source._v` directly on the fast path |
| `_bindDirect(source, el, key)` | Reactive attribute — fast path for primitive props |
| `_mountSlot(...)` | Mount a reactive child slot under a template anchor |
| `_applyProps(...)` | Spread props on a template element |
| `_rsCollapse(...)` / `_rsCollapseH(...)` | Rocketstyle compile-time-collapse mount paths |

## Event delegation

```ts
import { DELEGATED_EVENTS, delegatedPropName, setupDelegation } from '@pyreon/runtime-dom'

setupDelegation(rootElement)
```

Common bubbling events (`click`, `input`, `submit`, …) are attached once at the root via `setupDelegation` and dispatched per-node via the matching prop name. Tree-shakeable; only used by event names in `DELEGATED_EVENTS`.

## Transition

```tsx
import { Transition } from '@pyreon/runtime-dom'
// or, for explicit tree-shake:
// import { Transition } from '@pyreon/runtime-dom/transition'

<Transition name="fade" mode="out-in">
  <Show when={visible()}><div>Content</div></Show>
</Transition>
```

CSS-class enter/leave animations + JS hooks (`onBeforeEnter`, `onAfterLeave`, etc.). A 5-second timeout fires `transitionend` automatically if no real `transitionend` / `animationend` event arrives — animations never get stuck.

```tsx
import { TransitionGroup } from '@pyreon/runtime-dom'

<TransitionGroup name="list" tag="ul">
  <For each={items} by={i => i.id}>{(item) => <li>{item.name}</li>}</For>
</TransitionGroup>
```

`TransitionGroup` adds FLIP-style move animations for keyed lists.

## KeepAlive

```tsx
import { KeepAlive } from '@pyreon/runtime-dom'
// or: import { KeepAlive } from '@pyreon/runtime-dom/keep-alive'

<KeepAlive>
  {() => tab() === 'home' ? <Home /> : <Settings />}
</KeepAlive>
```

Caches inactive subtrees instead of destroying them — preserves component state (form inputs, scroll positions, signals) across toggles. Pair with `<Show>` or a route guard for tab-style UIs.

## Dev-mode gates

Dev-only warnings (e.g. duplicate `<For>` keys, mount of `null` container) are gated on `process.env.NODE_ENV !== 'production'` — the **bundler-agnostic library convention**. Every modern bundler (Vite, Webpack/Next.js, esbuild, Rollup, Parcel, Bun) auto-replaces `process.env.NODE_ENV` at consumer build time and tree-shakes the dev block to zero bytes in production. This is enforced repo-wide by the `pyreon/no-process-dev-gate` lint rule. Do NOT use `import.meta.env.DEV` (Vite/Rolldown-only) or `typeof process !== 'undefined' && …` (dead in real Vite browser bundles).

A tree-shake regression test (`src/tests/dev-gate-treeshake.test.ts`) bundles `mount.ts` through Vite production and asserts warn strings are gone from the output.

## Mount-pipeline optimizations

- **Devtools gated on `__DEV__`** — component-ID generation (`Math.random`), `_mountingStack`, `registerComponent`/`unregisterComponent` all behind `if (__DEV__)`. Zero production cost.
- **Lazy `LifecycleHooks`** — `mount` / `unmount` / `update` / `error` arrays start as `null`; allocated on first hook. ~80% of components have no hooks → no allocation.
- **Lazy `mountCleanups`** — only allocated when an `onMount` callback returns a cleanup.
- **`makeReactiveProps` scan-first** — checks for `_rp` brands before allocating the result object. Static-only components (60%+) skip the object entirely.
- **`renderEffect` first-run skip** — empty deps on first run means no cleanup to invoke.
- **`TextNode.data` no-op writes** — `_bindText` / `_bindDirect` skip DOM writes when the value hasn't changed.

## Documentation

Full docs: [docs.pyreon.dev/docs/runtime-dom](https://docs.pyreon.dev/docs/runtime-dom) (or `docs/src/content/docs/runtime-dom.md` in this repo).

## License

MIT
