---
title: "Pyreon in 2026: the year in commits"
description: "From an empty repository in March to 77 packages, a native compiler and a benchmark record that lists its own retractions. What we shipped, what we took back, and what is still open, counted from the repository."
date: 2026-12-28
slug: 2026-in-review
tags: [javascript, opensource, webdev, typescript]
cover: /blog/covers/2026-in-review.png
---
On 9 March 2026 the Pyreon repository did not exist. By 10 November it held 3,881 commits on `main`, 3,699 merged pull requests, 77 published packages and a framework that compiles one `.tsx` file to the web, SwiftUI and Jetpack Compose.

Most of those commits are mine. For most of the year Pyreon had one human contributor and a wall of automated checks. Here is what that year produced, month by month. Every count was taken from the repository and npm on 10 November 2026, the parts that did not go to plan included. For the numbers that move every day (stars, downloads, releases), [pyreon.dev/open](https://pyreon.dev/open) has them live, refreshed daily.

## The year in numbers

As of 10 November 2026:

| | |
| --- | ---: |
| commits on `main` | 3,881 |
| merged pull requests | 3,699 |
| issues opened / closed | 76 / 65 |
| published packages | 77 |
| test files (`*.test.ts[x]`) | 3,736 |
| of which run in real Chromium (`*.browser.test.ts[x]`) | 272 |
| `@pyreon/core` versions on npm | 112, from 0.1.0 (15 March) to 0.53.0 (13 October) |
| docs pages | 200+ |

Commits per month on `main`:

| Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov (1–10) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 394 | 256 | 634 | 713 | 615 | 446 | 455 | 237 | 131 |

## March and April: the core takes shape

The first releases, 0.1.0 and 0.1.1 on 15 March, already had the shape Pyreon still has: `signal`, `computed`, `effect` and `batch` in `@pyreon/reactivity`; `h()`, `<For>`, `<Show>`, `Suspense` and context in `@pyreon/core`; `mount` and `hydrateRoot` in `@pyreon/runtime-dom`; `renderToString` and `renderToStream` on the server; a router and head management. Zero, the meta-framework, moved into the monorepo on 26 March (#92).

On 21 April the JSX compiler got a Rust backend through napi-rs (#274). It came with a rule that has held all year: the Rust and JavaScript backends emit byte-identical output, enforced by equivalence and fuzz tests, and any change to the emitted code lands in both in the same PR.

## May and June: tooling, and a compiler for phones

- **Reactivity Lens** (#611, 17 May): the compiler's reactive-or-static decision for every JSX expression, shown in your editor as inlay hints.
- **PMTC** (#794, 21 May): the first emitter from Pyreon JSX to Swift and Kotlin. A skeleton then; a week later `create-multiplatform` scaffolded one `src/App.tsx` into a web, iOS and Android project (#1045, 29 May).
- **`@pyreon/sync`** (#1459, 9 June): a CRDT-backed local-first layer where a synced value is just a signal.
- **The cross-framework benchmark** (#1500, 10 June): one idiomatic Pyreon implementation against the field, with the framework order reshuffled every pass.

June was the busiest month of the year: 713 commits.

## July: render modes and AI tooling

- `routeRules` and the experimental `mode: 'auto'`, which picks SSG, SSR or ISR per route from what each route file exports (#2013, 2 July).
- `pyreon mcp` started the MCP server from the main CLI (#2051, 6 July). The server has 24 tools today.
- `@pyreon/atlas`, a component workbench that derives a machine-readable component catalog and verifies it (#2482, 23 July).
- `@pyreon/loom`, a dependency observatory for monorepos (#2609, 31 July).

## August: the month we checked our own numbers

August had two threads, and both were about finding where we were wrong.

The first was benchmarks. An audit found our row-list harness handicapping competitors: Svelte and Vue on non-idiomatic reactive state and Octane pinned behind its latest release (#2878). Within days it also found a `String()` wrapper that switched off Octane's compiler fast path (#2897), a V8 string cache charged to five implementations' heap (#2899), a CSS `table-layout` default that made one op bimodal and inflated a Pyreon lead about 2.3× (#2903), and sub-millisecond ops timed against a 100 µs clock (#2894). We retracted each one in public, and nearly every correction moved a number against us. The full story is in [We keep retracting our own benchmark wins](/blog/we-keep-retracting-our-benchmark-wins).

The second was hydration. Compiled templates were replacing the server's DOM nodes instead of adopting them, which wiped anything typed before the bundle loaded. #2918 (18 August) made them adopt, gated on a byte-equal check of the template's static skeleton. How that works is in [Hydration that adopts the server DOM](/blog/hydration-that-adopts-the-server-dom).

August also shipped `@pyreon/lathe`, OpenAPI to a typed client (#3077); Plain Mode, the experimental dialect where `let count = state(0); count++` compiles to signals (#3110); and our own charting engine for `@pyreon/charts` (#3128).

## September to November: depth over breadth

The last third of the year added fewer packages and a lot more correctness.

A still-loading `lazy()` route now hydrates in place instead of being rebuilt (#3731). `<For>` server rendering got a compact key list (#3946). `createUniqueId` became hydration-stable: per request on the server, one namespace per island (#4160).

The native compiler grew the most. In early November alone it learned to lower `throw` and `try/catch/finally` (#4100), `JSON.parse` into a typed decode (#4101), a schema's `.parse(x)` (#4102), `effect()` in a component body (#4134), `setTimeout` and `setInterval` (#4136), TypeScript enums (#4146), JavaScript `Date` (#4154), module-scope `signal()` and `computed()` (#4155), and hooks from `usePrevious` and `useKeyboard` to `useMediaQuery` for the colour scheme and `useInfiniteQuery`. The primitives gained `<Select>` (#4056) and date and time fields (#4057), each rendered with the platform's own control. The native example apps run XCUITest and Compose UI tests on simulators and emulators in CI.

`@pyreon/query` gained `queryOptions`, `infiniteQueryOptions` and `mutationOptions` (#4188). And `mode: 'auto'` now prerenders the routes it infers as static (#4138); before that fix, an inferred SSG route in a server app fell back to SSR at runtime. In the same weeks the primitives gained `<Tabs>` with per-tab back stacks (#4059, #4091) and a vector-drawing `<Canvas>` (#4064), and `Intl` date and number formatting started lowering to both phones (#4050).

On 5 November we re-ran the benchmark record end to end and rebuilt its confidence intervals with a cluster bootstrap over page loads (#4129). That turned a published loss and two published wins on the row board into ties or splits. The board today has one outright win, `clear rows` (1.11–1.12× over Vue 3.6 Vapor RC), and a section that lists where Pyreon is not the fastest: deep component-tree mount (Solid 1.15–1.18× ahead), bundle size (17.2 KB against Solid's 7.5 KB for the same app) and signal creation (about 5× slower than Preact Signals).

*Synthetic, author-run, Apple M3 Max. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

## What we did not finish

- **No independent benchmark run.** The keyed implementation for krausest/js-framework-benchmark is staged in `contrib/krausest/pyreon-keyed/`. As of 10 November it is not submitted yet.
- **Native is pre-1.0 and still filling in.** The capability matrix in the [multiplatform docs](/docs/multiplatform) credits a category only for behaviour asserted on a simulator or emulator, and its weakest rows (payments, crash reporting, push, store release) are low.
- **A full-stack benchmark without results.** A suite that runs `@pyreon/zero` against eight meta-frameworks now lives in the repo (`examples/stacks-bench`). No result from it is published yet.
- **Bundle size.** 17.2 KB for the benchmark app is more than twice Solid's, and it grew a little over the autumn instead of shrinking.
- **Contributors.** For most of the year there was one. That is the thing I most want to change in 2027.

## 2027 starts on phones

On 19 January we launch the native side of Pyreon in public: one `.tsx` file, compiled to SwiftUI on iOS and Jetpack Compose on Android, with the primitives rendering as each platform's real views. A deep dive into how the compiler does it comes first, on 11 January, and the launch post follows a week later.

After that, the first quarter follows the work: moving a React app over with `@pyreon/react-compat`, the seven rules of fine-grained reactivity, OpenAPI tooling with `lathe`, the AI tooling, and a full walk through the benchmarks we lose. If any of that sounds like something you would use, try it and tell us what broke. That is the most useful thing anyone did for this project in 2026.

## Start the new year with something new

```bash
npm create @pyreon/zero@latest
```

- Docs: [pyreon.dev/docs](/docs)
- Live numbers: [pyreon.dev/open](https://pyreon.dev/open)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord), get the monthly roundup in the [newsletter](https://pyreon.dev/newsletter), or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
