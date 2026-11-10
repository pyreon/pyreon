---
title: "Pyreon in 2026: the year in commits"
description: "From 0.1.1 in March to a public launch in December: what we shipped, what we took back, and what is still open. Every count comes from the repository."
date: 2026-12-28
slug: 2026-in-review
tags: [javascript, opensource, webdev, typescript]
cover: /blog/covers/2026-in-review.png
draft: true
---

{/* REFRESH on 28 Dec before removing `draft: true`: fill every {{placeholder}} and re-take the snapshot counts. Commands checked on 10 Nov 2026: commits on main via `gh api graphql` (repository.ref("refs/heads/main").target.history(since, until).totalCount; 3,827 for 2026-01-01..2026-11-09, per-month figures below); merged PRs via `gh api 'search/issues?q=repo:pyreon/pyreon+is:pr+is:merged+merged:<2026-11-09'` (3,645); issues via the same search with `is:issue+created:<…` (66) and `is:issue+is:closed+closed:<…` (63); test files via `git ls-files | grep -E '\.test\.tsx?$'` on origin/main (3,736, of which 272 `*.browser.test.ts[x]`). A local worktree is a shallow history: `git log | wc -l` undercounts, use the API. */}

On 9 March 2026 the Pyreon repository did not exist. By the end of 8 November it had 3,827 commits on `main`, 3,645 merged pull requests, 77 published packages and a framework that compiles one `.tsx` file to the web, SwiftUI and Jetpack Compose.

Most of those commits are mine. For most of the year Pyreon had one human contributor and a wall of automated checks. Here is what that year produced, month by month, with every count taken from the repository, including the parts that did not go to plan.

## The year in numbers

| | snapshot (8–10 Nov) | at publish |
| --- | ---: | ---: |
| commits on `main` | 3,827 | {{commits_main_2026}} |
| merged pull requests | 3,645 | {{merged_prs_2026}} |
| issues opened / closed | 66 / 63 | {{issues_opened}} / {{issues_closed}} |
| published packages | 77 | {{packages_at_publish}} |
| test files (`*.test.ts[x]`) | 3,736 | {{test_files}} |
| of which real-browser (`*.browser.test.ts[x]`) | 272 | {{browser_test_files}} |
| docs pages | 200+ | {{docs_pages}} |
| version | 0.1.1 (15 Mar) → 0.53.0 | {{version_at_publish}} |

Commits per month on `main`:

| Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov (1–8) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 394 | 256 | 634 | 713 | 615 | 446 | 455 | 237 | 77 |

And the launch figures, which do not exist yet as I write this: Show HN on 1 December reached {{hn_points}} points and {{hn_comments}} comments; the docs had {{docs_visitors_dec}} visitors in December; people outside the project opened {{github_issues_from_launch}} issues in the launch month; the repository has {{github_stars}} stars.

## March and April: the core takes shape

The first release, 0.1.1 on 15 March, already had the shape Pyreon still has: `signal`, `computed`, `effect` and `batch` in `@pyreon/reactivity`; `h()`, `<For>`, `<Show>`, `Suspense` and context in `@pyreon/core`; `mount` and `hydrateRoot` in `@pyreon/runtime-dom`; `renderToString` and `renderToStream` on the server; a router and head management. Zero, the meta-framework, moved into the monorepo on 26 March (#92).

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

`@pyreon/query` gained `queryOptions`, `infiniteQueryOptions` and `mutationOptions` (#4188). And `mode: 'auto'` now prerenders the routes it infers as static (#4138); before that fix, an inferred SSG route in a server app fell back to SSR at runtime.

On 5 November we re-ran the benchmark record end to end and rebuilt its confidence intervals with a cluster bootstrap over page loads (#4129). That turned a published loss and two published wins on the row board into ties or splits. The board today has one outright win, `clear rows` (1.11–1.12× over Vue 3.6 Vapor RC), and a section that lists where Pyreon is not the fastest: deep component-tree mount (Solid 1.15–1.18× ahead), bundle size (17.2 KB against Solid's 7.5 KB for the same app) and signal creation (about 5× slower than Preact Signals).

*Synthetic, author-run, Apple M3 Max. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

## December: launch

Pyreon went public on 1 December with a Show HN. {{launch_retro_one_paragraph: what people asked about most, what broke, what we fixed in the first week, with issue/PR numbers}}

## What we did not finish

- **No independent benchmark run.** The keyed implementation for krausest/js-framework-benchmark is staged in `contrib/krausest/pyreon-keyed/`. We did not submit it this year.
- **Native is pre-1.0 and still filling in.** The capability matrix in the [multiplatform docs](/docs/multiplatform) credits a category only for behaviour asserted on a simulator or emulator, and its weakest rows (payments, crash reporting, push, store release) are low.
- **A full-stack benchmark without results.** A suite that runs `@pyreon/zero` against eight meta-frameworks now lives in the repo (`examples/stacks-bench`). No result from it is published yet.
- **Bundle size.** 17.2 KB for the benchmark app is more than twice Solid's, and it grew a little over the autumn instead of shrinking.
- **Contributors.** For most of the year there was one. That is the thing I most want to change in 2027.

## 2027

The first quarter's posts follow the work: the native compiler (one `.tsx` to SwiftUI and Jetpack Compose), moving a React app over with `@pyreon/react-compat`, OpenAPI tooling with `lathe`, and the AI tooling. If any of that sounds like something you would use, the best thing you can do is try it and tell us what broke.

## Start the new year with something new

```bash
npm create @pyreon/zero@latest
```

- Docs: [pyreon.dev/docs](/docs)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on Discord{/* DISCORD-INVITE: link the permanent invite here once it exists */} or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
