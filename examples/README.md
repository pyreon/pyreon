# Examples

Every directory here is a private workspace package (`@pyreon/example-*`). Not all of them are written to be read: about half are test fixtures, benchmark harnesses or native device-gate hosts that CI depends on. This index says which is which.

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
| [react-compat](./react-compat/) | `@pyreon/react-compat` |
| [preact-compat](./preact-compat/) | `@pyreon/preact-compat` |
| [vue-compat](./vue-compat/) | `@pyreon/vue-compat` |
| [solid-compat](./solid-compat/) | `@pyreon/solid-compat` |
| [svelte-compat](./svelte-compat/) | `@pyreon/svelte-compat` |

## Multiplatform: one source, web + iOS + Android

One `.tsx` source compiled by PMTC to SwiftUI and Jetpack Compose, plus a web host. `bun create multiplatform` scaffolds this as one directory (`src/`, `ios/`, `android/`, web entry). Today, Counter, Router demo and Finance use that layout; Tasks and TodoMVC still split each target into its own host package. The analytics and viz apps that were compile-only now live as `packages/native/compiler/src/fixtures/showcase-{analytics,viz}.tsx`.

| App | Source | Hosts | Role |
| --- | --- | --- | --- |
| Tasks | [native-tasks](./native-tasks/) | [web](./native-tasks-web/) · [iOS](./native-tasks-ios/) · [Android](./native-tasks-android/) | The multi-feature showcase: store, auth gate, editors, charts. Device-gated in CI |
| Today | [native-showcase](./native-showcase/) (`src/`) | web (root) · iOS (`ios/`) · Android (`android/`), one package | The pyreon.dev home-page demo. CI builds both native hosts; its device tests are not run in CI yet |
| TodoMVC | in the iOS host | [web](./native-todomvc-web/) · [iOS](./native-todomvc-ios/) · [Android](./native-todomvc-android/) | The oldest PMTC device gate |
| Counter | [native-counter](./native-counter/) (`src/`) | iOS (`ios/`) · Android (`android/`), one package | Device APIs: geolocation, haptics, share, picker. Device-gated |
| Router demo | [native-router-demo](./native-router-demo/) (`src/`) | web (root) · iOS (`ios/`) · Android (`android/`), one package | Router, tabs, websocket, audio. Device-gated; the web build is e2e-tested |
| Finance | [native-finance](./native-finance/) (`src/`) | iOS (`ios/`) · Android (`android/`), one package | Real-app device gate: auth, form, store, routing |

## Test fixtures

Apps that exist for a test suite. They are not written to be read; change them together with the suite that uses them.

| Fixture | Used by |
| --- | --- |
| [playground](./playground/) | The root `bun run test:e2e` core-runtime suites and `verify-modes` |
| [ssr-showcase](./ssr-showcase/) | The Zero render-mode matrix: `verify-modes`, SSR/ISR/SSG/HMR/islands e2e suites, `zero-app-budgets.json` |
| [edge-runtimes](./edge-runtimes/) | `bun run test:e2e:edge-runtimes`, one build per edge adapter |
| [cssvars-bench](./cssvars-bench/) | The CSS-variables theming e2e suite and `scripts/bench-cssvars.ts` |
| [perf-dashboard](./perf-dashboard/) | `@pyreon/perf-harness` journeys (`perf.yml`) and the leak sweep (`leak-sweep.yml`) |
| [sync-yjs-demo](./sync-yjs-demo/) | The `@pyreon/sync` CRDT e2e suites (surgical update, merge, state-vector catch-up) |
| [cpa-pw-app](./cpa-pw-app/) · [cpa-pw-blog](./cpa-pw-blog/) · [cpa-pw-dash](./cpa-pw-dash/) | `create-zero` output for `bun run test:e2e:cpa`, exactly what the scaffolder emits plus declared fixture-only files. Regenerate with `bun scripts/scaffold-cpa-fixtures.ts`; `--check` (validate-fast) fails on drift. The `--compat` variants are scaffolded fresh by `scripts/scaffold-smoke.ts` instead of committed |

## Benchmarks

Harnesses behind the numbers in [`BENCHMARKS.md`](../BENCHMARKS.md). Read `.agents/guides/benchmarks/README.md` before running one.

| Harness | Measures |
| --- | --- |
| [benchmark](./benchmark/) | The DOM, SSR, hydration, bundle and charts suites, plus probe scripts |
| [real-bench](./real-bench/) | A TodoMVC-shaped app against real React DOM |
| [form-bench](./form-bench/) | A 12-field form against six form libraries |
| [stacks-bench](./stacks-bench/) | Zero against eight meta-frameworks, each on its own server |
