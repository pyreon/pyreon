# @pyreon/devtools

Chrome DevTools extension for Pyreon: the component tree with "why did this update?", the reactive graph, signals, effects, a profiler and a console.

`@pyreon/devtools` is a private workspace package — a Chrome DevTools extension that adds a **Pyreon** panel for inspecting running Pyreon apps. It reads `window.__PYREON_DEVTOOLS__` (installed by `@pyreon/runtime-dom` on first `mount()`) and bridges page → content-script → background service worker → DevTools panel. The panel has six tabs (Components, Graph, Signals, Effects, Profiler, Console); Graph, Signals, Effects and Profiler read the reactive bridge (`__PYREON_DEVTOOLS__.reactive`) on `@pyreon/reactivity`. Not published to npm — built unpacked and loaded via `chrome://extensions`.

## Features

Six tabs, all fed by the running page (nothing sampled or simulated):

- **Components**: the mounted tree, rebuilt from `parentId` (the framework registers post-order, so a parent's own `childIds` is empty). Filter, arrow-key navigation (`role="tree"`), Enter outlines the component on the page, newly mounted rows pulse. The inspector shows the owner path, the signals and computeds rendered as text inside the component (`reactive.nodesForElement`), and **Why did this update?**: the `getUpdateCause` chain behind the most recent of them, with source lines.
- **Graph**: signals → computeds → effects. *Selected* scopes to the selected signal, the selected component's reads or the last write; *Everything* draws the 120 most active nodes and says how many it left out.
- **Signals**: value, subscribers, writes, last write; filterable and virtualised.
- **Effects**: a fire lane per effect that ran in the last 10 s, with what it reads.
- **Profiler**: record, then every batch (one synchronous cascade, grouped by the fires' `cascade` stamp) with the change that started it. Reports when the page's 512-fire ring wrapped between polls.
- **Console**: `[Pyreon]` warnings and errors logged while the panel is open, and an input that evaluates in the page.
- **Element picker**: the toolbar button drives the framework's overlay (`Ctrl+Shift+P`).

Computeds and effects have no runtime name, so they are shown by where they were created (`Composer.tsx:31`). Limits: the inspector traces text bindings only (no attribute bindings, no text passed as component children), and it cannot show props or owned effects because the hook does not expose them. Components mounted by `hydrateRoot` are not registered by the framework yet, so the Components tab is empty for SSR apps (#4444). Props and owned effects: #4446.

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
bun run test        # vitest run (happy-dom)
bun run test:browser # real-Chromium panel test against a real Pyreon app
bun run verify      # the built extension in Chromium against a running app
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
Page world: page-hook.ts → hook.ts (createHook)   <-> window.postMessage
Content script (content-script.ts)                <-> chrome.runtime messaging
Background service worker (background.ts)         <-> chrome.runtime.Port
DevTools panel: panel.ts → panel-app.ts           (createPanelApp)
```

- `hook.ts` answers panel requests with plain data only. Mounts/unmounts and console lines are coalesced over 100 ms, so a page that mounts 10,000 components sends a handful of messages. Source locations are reduced to the file's base name before sending.
- The panel connects with a `hello` handshake, so it works when DevTools opens after the page loaded.
- `panel-app.ts` takes a transport, so the same UI runs inside DevTools, as `panel.html?tabId=N` in a tab, and in the browser test.
- Data shaping is pure and unit-tested: `tree.ts` (tree from `parentId`, filter, owner path), `reactive-view.ts` (graph scopes, signal rows, effect lanes, profiler batches, cause chains), `virtual.ts` (visible window).
- Colours live in one token block at the top of `panel.css` (dark and light); `theme-tokens.test.ts` fails on a raw colour anywhere else.

### Panel performance

Measured by `panel.browser.test.tsx` with 10,000 signals, 200 computeds and 200 effects (Apple M-series, headless Chromium; numbers vary by machine): about 5 ms of page time per graph poll (graph walk plus `JSON.stringify`) and about 5 ms of panel time (parse plus render), on a 1.6 MB snapshot. The graph is polled every second on the Graph, Signals, Effects and Profiler tabs and every 5 s elsewhere. The tree and the signals table are virtualised (the table keeps about 25 rows in the DOM at 10,000 signals); the graph, effect lanes, profiler list and console are capped and say so.

The panel never holds page objects: every message crosses the extension boundary as serialised data, and the page hook keeps only a 200-line console ring (FIFO) and the current 100 ms batch of ids.

## Foundation contract

`src/tests/framework-integration.test.ts` proves the contract against the **real** `@pyreon/runtime-dom`: it mounts a genuine component tree through the real `mount()` (which installs `window.__PYREON_DEVTOOLS__` and registers components via the true pipeline) and runs the extension's actual `serialize` / `buildMap` / `getChildren` / `getRoots` against the live hook. A compile-time bidirectional assignability lock against the framework's exported `PyreonDevtools` / `DevtoolsComponentEntry` types means a framework API drift fails `tsc` instead of the extension silently losing a capability.

`src/tests/reactive-e2e.test.ts` does the same for the reactive tabs: drives real `@pyreon/reactivity` primitives (`signal` / `computed` / `effect`) through the real `__PYREON_DEVTOOLS__.reactive` hook, then feeds the live graph/fire snapshot into the extension's own `layoutGraph` / `ingestFires` (the code the Graph/Profiler tabs run) — proving the whole chain end-to-end. Includes a bidirectional drift lock against `@pyreon/reactivity`'s exported `ReactiveGraph` / `ReactiveNode` / `ReactiveFire` and an opt-in check (nothing tracked until `activate()`).

## Graceful degradation

The `reactive` namespace on `__PYREON_DEVTOOLS__` is optional. Against a framework build without it, the Graph, Signals, Effects and Profiler tabs say so instead of showing an empty surface; Components and Console work regardless. Web fonts are not loaded (MV3 panel CSP, offline); the stacks fall back to system mono and sans.

## Design

Implements the pyreon.dev design canvas `Devtools.html`: the app-shell patterns of `pyreon-app.css` (13 px, 28-32 px rows, mono for data), the site tokens in both themes, and the stacked layout below 760 px. Inside Chrome DevTools the panel follows the DevTools theme (`chrome.devtools.panels.themeName`, live via `setThemeChangeHandler`); opened as a page it takes `?theme=` or the OS preference.

## Tests

- `bun run test`: unit tests (happy-dom) for the data shaping, the page hook against the real `mount()`, and the theme tokens.
- `bun run test:browser`: `src/tests/panel.browser.test.tsx` in real Chromium. A real Pyreon app (compiled by the real `@pyreon/vite-plugin`) runs in the same page as the panel UI and the page hook, joined by a transport that JSON-serialises like extension messaging. It covers the tree, keyboard use, the inspector's cause chain, every tab, 4.5:1 text contrast and overflow in both themes at 1100 px and 700 px, and the 10,000-signal case. `VITE_DEVTOOLS_SHOTS=1` also writes a screenshot of every tab to `verification-screenshots/`. The extension itself cannot be loaded into the vitest browser; `bun run verify` covers that.

## Verification

`bun run verify` (after `bun run build`) launches Chromium with the built extension (`--load-extension=dist`, headless; `HEADED=1` shows the window), opens a running Pyreon dev app (`APP_URL`, default `http://localhost:5180`; `examples/perf-dashboard` serves on 5800), and checks:

1. every `dist/` file is present and the IIFE entries do not reference an undeclared `exports`;
2. the content script and page hook inject, and the hook exposes the component and `reactive` surfaces;
3. `reactive.getGraph()` / `getFires()` return live data and source locations resolve;
4. the component tree is populated;
5. the real panel, opened as `panel.html?tabId=<app tab>` (the same code, background relay and content script as in DevTools), renders every tab in dark and light at 1240 px and 700 px without page errors or horizontal scroll. Screenshots go to `SHOTS_DIR` (default `verification-screenshots/`).

What it cannot do: open the DevTools window (F12) and click the Pyreon tab, which Playwright cannot drive. For that step, load the extension by hand and click through the six tabs.

## License

MIT
