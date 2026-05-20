# @pyreon/devtools

Chrome DevTools extension for Pyreon — live component tree, reactive graph, click-to-highlight.

`@pyreon/devtools` is a private workspace package — a Chrome DevTools extension that adds a **Pyreon** panel for inspecting running Pyreon apps. It reads `window.__PYREON_DEVTOOLS__` (installed by `@pyreon/runtime-dom` on first `mount()`) and bridges page → content-script → background service worker → DevTools panel. The panel ships six tabs (Components / Graph / Signals / Effects / Profiler / Console), with the last five reading the opt-in reactive devtools Foundation on `@pyreon/reactivity`. Not published to npm — built unpacked and loaded via `chrome://extensions`.

## Features

- **Components** — live component tree reconstructed from `parentId` (the framework registers post-order, so a parent's own `childIds` is empty when its children registered first; the panel rebuilds via `parentId` indexing).
- **Click-to-highlight** — clicking any component highlights its DOM element on the page.
- **Element picker** — toolbar **Inspect** toggle drives the framework's hover-to-inspect overlay (`enable/disableOverlay`); same picker as `Ctrl+Shift+P`.
- **Hot-row pulse** — a freshly mounted component pulses with the ember signal-propagation animation (reduced-motion gated). Pyreon components mount once, so "just mounted" is the truthful on-brand analog of the design's RE-RENDERED hot state.
- **Inspector pane** — id, parent, children, depth.
- **Graph / Signals / Effects / Profiler / Console** — backed by the reactive devtools Foundation on `@pyreon/reactivity` (signals table, layered SVG dependency graph, per-node fire lanes, 100 ms-bucketed profiler, page-world eval bridge).

## Development install

```bash
bun install                                    # from monorepo root
bun run --filter='@pyreon/devtools' build      # → dist/
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this package's `dist/` directory.

## Commands

```bash
bun run build       # production build → dist/ (+ syncs manifest version from package.json)
bun run dev         # watch mode with auto-rebuild
bun run test        # vitest run
bun run lint        # oxlint .
bun run typecheck   # tsc --noEmit
```

Regenerate the brand icons after a palette change:

```bash
bun run scripts/generate-icons.ts   # dependency-free PNG encoder, ember-on-ink mark
```

## Architecture

Four isolated execution contexts communicate via tagged message passing:

```text
Page world (window.__PYREON_DEVTOOLS__)        <-> window.postMessage
Content script (content-script.ts)             <-> chrome.runtime messaging
Background service worker (background.ts)      <-> chrome.runtime.Port
DevTools panel (panel.ts)
```

Pure logic (`messages.ts`, `serialize.ts`, `tree.ts`, `reactive-view.ts`) is 100% unit-tested under happy-dom; the four browser-sandbox context entry points are coverage-excluded because they only run inside the extension sandbox.

## Foundation contract

`src/tests/framework-integration.test.ts` proves the contract against the **real** `@pyreon/runtime-dom`: it mounts a genuine component tree through the real `mount()` (which installs `window.__PYREON_DEVTOOLS__` and registers components via the true pipeline) and runs the extension's actual `serialize` / `buildMap` / `getChildren` / `getRoots` against the live hook. A compile-time bidirectional assignability lock against the framework's exported `PyreonDevtools` / `DevtoolsComponentEntry` types means a framework API drift fails `tsc` instead of the extension silently losing a capability.

`src/tests/reactive-e2e.test.ts` does the same for the reactive tabs: drives real `@pyreon/reactivity` primitives (`signal` / `computed` / `effect`) through the real `__PYREON_DEVTOOLS__.reactive` hook, then feeds the live graph/fire snapshot into the extension's own `layoutGraph` / `bucketFires` (the code the Graph/Profiler tabs run) — proving the whole chain end-to-end. Includes a bidirectional drift lock against `@pyreon/reactivity`'s exported `ReactiveGraph` / `ReactiveNode` / `ReactiveFire` and an opt-in check (nothing tracked until `activate()`).

## Graceful degradation

The `reactive` namespace on `__PYREON_DEVTOOLS__` is **optional**. Against a framework build without the Foundation, the Graph/Signals/Effects/Profiler/Console tabs show an explicit "needs `@pyreon/runtime-dom` with the reactive-devtools Foundation" notice — never a fake/empty surface (honesty over theater, per the brand brief). The Components tab works regardless. Reactive-tab polling is active only while a reactive tab is open. Web fonts are intentionally not loaded (MV3 panel CSP + offline-safety); the design's font stacks degrade to system mono/sans.

## Design

The panel implements the Claude-Design handoff (`pyreon-devtools.jsx` + `tokens.css`): the `PxDevChrome` shell (traffic-light title bar, glyph + wordmark, ember-gradient active-tab underline, breadcrumb + live status) and the `PxArtDevTree` Components split (depth-indented mono tree, `SELECTED`-eyebrow inspector). Full design token system (ink/paper/gray ramps, ember gradient, cyan), JetBrains Mono + Space Grotesk, dark by default with the light token block honoring DevTools' theme.

## License

MIT
