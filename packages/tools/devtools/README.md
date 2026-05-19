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
- Real-time mount/unmount tracking
- Automatic Pyreon framework detection (`window.__PYREON_DEVTOOLS__`, installed by `@pyreon/runtime-dom` on first `mount()`)
- Pyreon brand identity (ink/ember/cyan palette, Space Grotesk + JetBrains Mono)

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

## License

[MIT](LICENSE)
