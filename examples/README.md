# Examples

Every example is a private workspace package (`@pyreon/example-*`). The top level holds the apps worth reading, the native apps and the benchmark harnesses; `compat/` holds one app per framework compat layer, and `fixtures/` holds apps that exist for a test suite and are not written to be read. This index lists every one. Code that needs an example's directory goes through `scripts/example-dirs.ts`, which fails on a missing example.

New to Pyreon? Scaffold an app with `bun create zero`, then read [app-showcase](./app-showcase/), then the reference app that matches your render mode: [hn-clone](./hn-clone/) (SSG), [kanban](./kanban/) (SPA), [islands-showcase](./islands-showcase/) (islands).

Run any app from the repo root after `bun install`:

```bash
cd examples/<name>
bun run dev        # most apps; native hosts use build/check, see their README
```

Examples are never published and never versioned: `.changeset/config.json` ignores `@pyreon/example-*`, so they carry no `CHANGELOG.md`.

## Start here

| Example | What it shows |
| --- | --- |
| [app-showcase](./app-showcase/) | One Zero app with every package in real feature slices (blog, shop, kanban, chat, flow, …); `/chat/live` is the chat against a real server (SSE stream, optimistic send) |
| [hn-clone](./hn-clone/) | SSG reference app: a read-heavy Hacker News reader |
| [kanban](./kanban/) | SPA reference app: write-heavy CRUD with state-tree, dnd and i18n |
| [collab-board](./collab-board/) | Real-time collaboration with `@pyreon/sync` |
| [islands-showcase](./islands-showcase/) | `@pyreon/server` islands, one per hydration strategy |
| [ui-showcase](./ui-showcase/) | Every `@pyreon/ui-components` component |
| [fundamentals-playground](./fundamentals-playground/) | One demo per fundamentals package |
| [lathe-bookshelf](./lathe-bookshelf/) | An app generated from `openapi.yaml` by `@pyreon/lathe` |
| [atlas-workshop](./atlas-workshop/) | The `@pyreon/atlas` component workbench over a rocketstyle kit |

## Migrating from another framework

Each app is shaped like the source framework and runs on its Pyreon compat layer. Each one is also that layer's e2e fixture, in dev and against the shipped `lib/`.

| Example | Compat layer |
| --- | --- |
| [compat/react](./compat/react/) | `@pyreon/react-compat` |
| [compat/preact](./compat/preact/) | `@pyreon/preact-compat` |
| [compat/vue](./compat/vue/) | `@pyreon/vue-compat` |
| [compat/solid](./compat/solid/) | `@pyreon/solid-compat` |
| [compat/svelte](./compat/svelte/) | `@pyreon/svelte-compat` |

## Multiplatform: one source, web + iOS + Android

One `.tsx` source compiled by PMTC to SwiftUI and Jetpack Compose, plus a web host. `bun create multiplatform` scaffolds this as one directory (`src/`, `ios/`, `android/`, web entry); `native-showcase` already uses that layout, the other apps still split each target into its own host package. The analytics and viz apps that were compile-only now live as `packages/native/compiler/src/fixtures/showcase-{analytics,viz}.tsx`.

| App | Source | Hosts | Role |
| --- | --- | --- | --- |
| Tasks | [native-tasks](./native-tasks/) | [web](./native-tasks-web/) · [iOS](./native-tasks-ios/) · [Android](./native-tasks-android/) | The multi-feature showcase: store, auth gate, editors, charts. Device-gated in CI |
| Today | [native-showcase](./native-showcase/) (`src/`) | web (root) · iOS (`ios/`) · Android (`android/`), one package | The pyreon.dev home-page demo. CI builds both native hosts; its device tests are not run in CI yet |
| TodoMVC | in the iOS host | [web](./native-todomvc-web/) · [iOS](./native-todomvc-ios/) · [Android](./native-todomvc-android/) | The oldest PMTC device gate |
| Counter | in the iOS host | [iOS](./native-counter-ios/) · [Android](./native-counter-android/) | Device APIs: geolocation, haptics, share, picker. Device-gated |
| Router demo | in the iOS host | [web](./native-router-demo-web/) · [iOS](./native-router-demo-ios/) · [Android](./native-router-demo-android/) | Router, tabs, websocket, audio. Device-gated |
| Finance | [native-finance](./native-finance/) | [iOS](./native-finance-ios/) · [Android](./native-finance-android/) | Real-app device gate: auth, form, store, routing |

## Test fixtures

Apps in `examples/fixtures/` exist for a test suite. They are not written to be read; change them together with the suite that uses them.

| Fixture | Used by |
| --- | --- |
| [fixtures/playground](./fixtures/playground/) | The root `bun run test:e2e` core-runtime suites and `verify-modes` |
| [fixtures/ssr-showcase](./fixtures/ssr-showcase/) | The Zero render-mode matrix: `verify-modes`, SSR/ISR/SSG/HMR/islands e2e suites, `zero-app-budgets.json` |
| [fixtures/edge-runtimes](./fixtures/edge-runtimes/) | `bun run test:e2e:edge-runtimes`, one build per edge adapter |
| [fixtures/cssvars](./fixtures/cssvars/) | The CSS-variables theming e2e suite and `scripts/bench-cssvars.ts` |
| [fixtures/perf-dashboard](./fixtures/perf-dashboard/) | `@pyreon/perf-harness` journeys (`perf.yml`) and the leak sweep (`leak-sweep.yml`) |
| [fixtures/sync-yjs](./fixtures/sync-yjs/) | The `@pyreon/sync` CRDT e2e suites (surgical update, merge, state-vector catch-up) |
| [fixtures/cpa/app](./fixtures/cpa/app/) · [fixtures/cpa/blog](./fixtures/cpa/blog/) · [fixtures/cpa/dash](./fixtures/cpa/dash/) | `create-zero` output for `bun run test:e2e:cpa`, exactly what the scaffolder emits plus declared fixture-only files. Regenerate with `bun scripts/scaffold-cpa-fixtures.ts`; `--check` (validate-fast) fails on drift. The `--compat` variants are scaffolded fresh by `scripts/scaffold-smoke.ts` instead of committed |

## Benchmarks

Harnesses behind the numbers in [`BENCHMARKS.md`](../BENCHMARKS.md). Read `.agents/guides/benchmarks/README.md` before running one.

| Harness | Measures |
| --- | --- |
| [benchmark](./benchmark/) | The DOM, SSR, hydration, bundle and charts suites, plus probe scripts |
| [real-bench](./real-bench/) | A TodoMVC-shaped app against real React DOM |
| [form-bench](./form-bench/) | A 12-field form against six form libraries |
| [stacks-bench](./stacks-bench/) | Zero against eight meta-frameworks, each on its own server |
