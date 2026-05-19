# @pyreon/devtools

Chrome DevTools extension for the [Pyreon](https://github.com/pyreon/pyreon) UI framework. Adds a **Pyreon** panel to Chrome DevTools with a live component tree, click-to-highlight, and inspector.

Private workspace package — built and loaded unpacked, not published to npm.

## Features

- Live component tree reflecting the current page state (rebuilt from
  `parentId` — the framework registers post-order, so a parent's own
  `childIds` is empty when its children register first)
- Click any component to highlight its DOM element on the page
- **Element picker** — the toolbar **Inspect** toggle drives the
  framework's hover-to-inspect overlay (`enable/disableOverlay`), the
  same picker as `Ctrl+Shift+P`
- Inspector pane showing component details (id, parent, children)
- Real-time mount/unmount tracking — a freshly-mounted component **pulses**
  with the signature ember signal-propagation animation (reduced-motion
  gated). Pyreon components mount once, so "just mounted" is the truthful
  on-brand analog of the design's RE-RENDERED hot state
- Automatic Pyreon framework detection (`window.__PYREON_DEVTOOLS__`, installed by `@pyreon/runtime-dom` on first `mount()`)

## Design

The panel implements the **Claude-Design handoff** (`pyreon-devtools.jsx` +
`tokens.css`): the `PxDevChrome` shell — traffic-light title bar with the
inspected origin, Pyreon glyph + wordmark, tab bar with an ember-gradient
active underline, breadcrumb + live status — and the `PxArtDevTree`
Components split (depth-indented mono tree with hot rows ┊ inspector with
`SELECTED` eyebrows and chips). Full design token system (ink/paper/gray
ramps, ember gradient, cyan), JetBrains Mono + Space Grotesk, dark by
default with the light token block honoring DevTools' theme.

The design's other five tabs — **Graph · Signals · Effects · Profiler ·
Console** — are implemented against the reactive-devtools Foundation
(`window.__PYREON_DEVTOOLS__.reactive`, shipped by `@pyreon/runtime-dom`):

- **Signals** — live table of every signal/derived/effect (name, kind,
  value preview, subscriber count, fire count), sorted by activity, hot
  rows ember-tinted.
- **Graph** — layered SVG dependency diagram (signals → derived →
  effects), ember edges on the recently-fired path.
- **Effects** — per-node fire lanes across the observed time window.
- **Profiler** — fires bucketed into 100&thinsp;ms frames (design
  PxArtDevProfiler), peak/frame summary.
- **Console** — evaluates expressions in the inspected page's world
  (`> __PYREON_DEVTOOLS__.reactive.getGraph()`), result streamed back.

**Graceful degradation:** the `reactive` namespace is OPTIONAL. Against
a framework build without the Foundation, these tabs show an explicit
"needs `@pyreon/runtime-dom` with the reactive-devtools Foundation"
notice — never a fake/empty surface (honesty over theater, per the
brand brief). Components works regardless. Polling is active only while
a reactive tab is open. Web fonts are intentionally not loaded (MV3
panel CSP + offline-safety); the design's font stacks degrade to system
mono/sans.

> **Requires the Foundation PR merged first.** This package only
> *consumes* `__PYREON_DEVTOOLS__.reactive`; the framework side
> (`@pyreon/reactivity` opt-in registry + `@pyreon/runtime-dom` hook
> exposure) ships separately. Until that lands the five tabs show the
> degradation notice — by design, not breakage.

## Install (development)

```bash
bun install                       # from the monorepo root
bun run --filter='@pyreon/devtools' build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this package's `dist/` directory

## Commands

```bash
bun run build       # production build -> dist/ (+ syncs manifest version)
bun run dev         # watch mode with auto-rebuild
bun run test        # run tests (vitest)
bun run lint        # oxlint .
bun run typecheck   # tsc --noEmit
```

Regenerate the brand icons after a palette change:

```bash
bun run scripts/generate-icons.ts
```

## Architecture

Four isolated execution contexts communicate via tagged message passing:

```
Page (window.__PYREON_DEVTOOLS__)         <-> window.postMessage
Content Script (content-script.ts)        <-> chrome.runtime messaging
Background Service Worker (background.ts)  <-> chrome.runtime.Port
DevTools Panel (panel.ts)
```

The pure logic (`messages.ts`, `serialize.ts`, `tree.ts`) is unit-tested
under happy-dom; the four context entry points are coverage-excluded
because they only run inside the browser extension sandbox.

`src/tests/framework-integration.test.ts` proves the contract against
the **real** `@pyreon/runtime-dom`: it mounts a genuine component tree
through the real `mount()` (which installs `window.__PYREON_DEVTOOLS__`
and registers components via the true pipeline) and runs the
extension's actual `serialize` / `buildMap` / `getChildren` / `getRoots`
against the live hook — plus a compile-time bidirectional assignability
lock against the framework's exported `PyreonDevtools` /
`DevtoolsComponentEntry`, so a framework API drift fails `tsc` instead
of the extension silently losing a capability.

`src/tests/reactive-e2e.test.ts` does the same for the reactive
surfaces: it drives the real `@pyreon/reactivity` primitives
(`signal`/`computed`/`effect`) through the real
`__PYREON_DEVTOOLS__.reactive` hook, then feeds the live graph/fire
snapshot into the extension's own `layoutGraph` / `bucketFires` (the
code the Graph/Profiler tabs run) — proving the whole chain end-to-end:
opt-in registry → hook → panel presentation. Includes a bidirectional
drift lock against `@pyreon/reactivity`'s exported `ReactiveGraph` /
`ReactiveNode` / `ReactiveFire` and an opt-in check (nothing tracked
until `activate()`).

## License

[MIT](LICENSE)
