---
title: "Introducing Pyreon"
description: "A TypeScript UI framework where components run once, the benchmark page lists our losses next to our wins, and one .tsx file can compile to SwiftUI and Jetpack Compose. Here is what is in the box, what is not finished, and how to start in a minute."
date: 2026-12-01
slug: introducing-pyreon
tags: [javascript, typescript, webdev, opensource]
cover: /blog/covers/introducing-pyreon.png
---

What if your component ran once, and a state change touched only the exact text node that shows it? No re-render pass, no virtual DOM, no dependency arrays to keep in sync.

That is Pyreon: a TypeScript UI framework built on signals, where the compiler wires each piece of state straight to the DOM node that displays it. It is MIT-licensed, it is at version 0.53, and today we're opening the doors. Build something with it and tell us where it breaks.

I started the public repository in March 2026, and so far nearly every commit in it is mine. Here is what Pyreon is, what ships in the box, what is not finished, and how to try it in a minute.

## Ten lines

```tsx
import { signal, computed } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'

function Counter() {
  const count = signal(0)
  const double = computed(() => count() * 2)
  return (
    <button onClick={() => count.update((n) => n + 1)}>
      {count()} × 2 = {double()}
    </button>
  )
}

mount(<Counter />, document.getElementById('app')!)
```

`Counter` runs once. The compiler turns the JSX into a cloned `<button>` template plus a single text binding that fuses `count()`, ` × 2 = ` and `double()` into one text node. A click writes `count`, `double` recomputes, and that one node updates. `count()` reads a signal; `count.set(v)` and `count.update(fn)` write it.

If you know Solid, the model will feel familiar. The [first post in this series](/blog/components-run-once) shows the compiled output line by line and the rules for what stays live.

## Four reasons to look twice

Pyreon is not the first signals framework, and it doesn't need to be. These are the four places where it gives you something new.

### 1. Components run once, and the compiler shows its work

Forget `useMemo`, `useCallback` and stale closures from a dependency array someone forgot to update. The trade is that a signal read in the component body is a snapshot, not a live value, so Pyreon's compiler does more of the work for you than a plain signals runtime would. Signal reads in props become getters. A `const` derived from props is inlined back at its JSX use sites so it stays live. And your editor shows, per expression, whether something is `live` or `static`.

### 2. Benchmarks that publish their own mistakes

We publish where we lose, so you can trust where we win. Our benchmark record has retracted its own published wins again and again:

- A `String()` wrapper in our harness disabled a rival's (Octane's) compiler fast path.
- A V8 string cache inflated retained heap for five implementations.
- A CSS `table-layout: auto` default inflated one Pyreon lead about 2.3×.
- Without cross-origin isolation, Chromium clamps the timer to 100 µs, so sub-millisecond operations were being measured in whole ticks.
- In November our confidence intervals treated 100 samples from 5 page loads as independent. The cluster bootstrap that replaced them turned a published loss and two published wins into ties.

Each one is written down in the repo, with the guard that stops it coming back. [Last week's post](/blog/we-keep-retracting-our-benchmark-wins) walks through all of them.

What survives that scrutiny? On the current row-list board (10 frameworks, real Chromium), Pyreon has one outright win: clear rows, 130 µs against Vue 3.6 Vapor RC's 145 µs. Create, replace, partial update, swap and remove are statistical ties with Vapor RC, Octane and Vue 3. Against React 19, creating 10,000 rows is about 2.6× faster (72.6 vs 192.0 ms). We lose deep component-tree mounts to Solid (1.15–1.18×), and our bundle for the same app is 17.2 KB gzipped against Solid's 7.5 KB.

*Apple M3 Max, real Chromium, synthetic, author-run. Reproduce it: [benchmarks](/docs/benchmarks).*

### 3. One `.tsx`, three platforms

PMTC, the Pyreon Multi-Target Compiler (`@pyreon/native-compiler`), compiles a subset of Pyreon JSX to SwiftUI and Jetpack Compose. Write `<Stack>`, `<Text>`, `<Field>` and `<Button>` from `@pyreon/primitives` (22 canonical primitives, now including `<Select>` and date and time fields), and you get a `VStack` and a `TextField` on iOS, a `Column` and a text field on Android: real platform views. The example apps (`native-todomvc`, `native-tasks`, `native-finance`) build for iOS, Android and the web from the same source, and CI runs XCUITest and Compose UI tests against them on simulators and emulators.

The subset keeps growing. In the last few weeks it learned JavaScript `Date`, TypeScript enums, `setTimeout` and `setInterval`, `effect()` in a component body, `throw` and `try`/`catch`/`finally`, and `JSON.parse`.

Not everything lowers. Packages that depend on the DOM (the code editor, drag and drop, the TanStack-based table) are labelled web-only, package by package, and a rich web component can be hosted in a WebView on native when you need it. The native targets are the experimental part of the project, and January's posts are all about them.

### 4. Built for AI coding assistants

`@pyreon/mcp` is an MCP server with 24 tools: `get_api` answers API questions from the same manifests that generate the docs, `validate` statically catches React habits and Pyreon misuse, `explain_reactivity` returns the compiler's per-expression verdict, `diagnose` explains error strings, and more. `@pyreon/lint` has 133 rules and an LSP server that renders the Reactivity Lens hints. `pyreon check` runs the same detectors from your terminal and exits non-zero on a finding. `llms.txt` and `llms-full.txt` are generated from the package manifests.

The scaffolder sets your assistant up on day one: `.mcp.json` and `CLAUDE.md` by default, plus `AGENTS.md`, Cursor rules or Copilot instructions if you pick them.

## What is in the box

77 published packages, all versioned together:

- **Core:** `@pyreon/reactivity`, `@pyreon/core`, `@pyreon/runtime-dom`, `@pyreon/runtime-server`, router, head, server, and the compiler. The compiler has a Rust backend (napi-rs) that runs 3.7–8.9× faster than its JavaScript fallback, and both must emit byte-identical output.
- **`@pyreon/zero`**, the meta-framework: file-based routing, SSG, SSR (string or streaming), ISR, SPA and islands, per-route render modes, an experimental `mode: 'auto'` that infers the mode per route, and deploy adapters for Node, Bun, Deno, Vercel, Netlify, Cloudflare and static hosting.
- **Fundamentals:** store, state-tree, form, validation, query, http, table, virtual, i18n, charts (our own engine), flow diagrams, code editor, rich text, document export, sync (CRDT), hooks, and more.
- **Tools:** `@pyreon/atlas` (a component workbench that verifies components and serves a machine-readable catalog), `@pyreon/lathe` (OpenAPI to typed schemas, endpoints, query hooks and mocks), `@pyreon/loom` (a monorepo dependency observatory), and the `pyreon` CLI.
- **Compat layers** for React, Preact, Vue, Solid and Svelte, with near-full public-API parity, so you can migrate one component at a time. Expect to fix a few things along the way.
- **Plain Mode** (experimental): with `'use plain'`, `let count = state(0); count++` compiles to the same signal code.

The documentation site has 200+ pages, and it is built with `@pyreon/zero` itself.

## Where it stands today

Read this before you put Pyreon anywhere that matters.

- **It is pre-1.0.** Breaking changes ship as minor versions, with changelogs. `pyreon upgrade` aligns every `@pyreon/*` dependency to one version, but expect churn.
- **It is not production-proven.** There is no adoption data to cite because adoption starts now. You would be among the first.
- **The native targets are experimental.** The compiled subset of TypeScript is deliberately narrow. Code outside it almost always produces a named compiler warning; "almost always" is the accurate wording. The weakest native areas (payments, crash reporting, push, store release) are listed in the capability matrix on the [multiplatform docs page](/docs/multiplatform).
- **The benchmarks are ours.** Every number above was produced and judged by the project's authors, on synthetic workloads, on one machine. An implementation for the independent krausest/js-framework-benchmark is staged, not yet submitted.
- **Known losses** are listed above and on the [benchmarks page](/docs/benchmarks). Bundle size is the one most people will notice.
- **The ecosystem is young.** Most questions don't have a Pyreon answer on Stack Overflow yet. The MCP server and the docs fill that gap for now, and so do we.

## Try it in a minute

A full-stack app with routing, streaming SSR, a store, queries and forms:

```bash
npm create @pyreon/zero@latest my-app
cd my-app
npm install
npm run dev
```

Prefer Bun? `bun create @pyreon/zero my-app`. The scaffolder asks for a template (`app`, `blog`, `dashboard`, `monorepo`), a render mode and a deploy target; `npm create @pyreon/zero@latest my-app -- --yes` takes the defaults. It never installs dependencies itself, so you stay in control.

Just the runtime, in an existing Vite project:

```bash
npm install @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/vite-plugin
```

Add `pyreon()` (the default export of `@pyreon/vite-plugin`) to your Vite plugins, and set `"jsx": "react-jsx"` and `"jsxImportSource": "@pyreon/core"` in `tsconfig.json`. The [getting started guide](/docs/getting-started) has the full setup.

Web, iOS and Android from one source (device builds need Xcode and the Android SDK):

```bash
npm create @pyreon/multiplatform@latest my-app
```

## How you can help

The best thing you can do right now is build something real and tell us what breaks.

- **Issues:** [github.com/pyreon/pyreon/issues](https://github.com/pyreon/pyreon/issues). A minimal reproduction is gold, and a docs bug counts as a bug.
- **Benchmarks:** think a harness is unfair to a framework, Pyreon included? Open an issue. Every accepted correction goes into the record.
- **Migration reports:** tried a compat layer on an existing React, Vue or Solid app? Tell us which APIs failed.
- **Native testers:** build iOS or Android apps? We want to hear what your app needs that the capability matrix does not cover yet.

I'll be in the Hacker News thread today and answering issues all week.

## Start building

```bash
npm create @pyreon/zero@latest
```

- Docs: [pyreon.dev/docs](/docs)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord) or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
