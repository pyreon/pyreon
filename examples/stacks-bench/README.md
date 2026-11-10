# stacks-bench — full-stack meta-frameworks vs `@pyreon/zero`

The same small app in each stack, built for production and served by that framework's own documented Node server, measured by one harness:

| arm (`apps/<id>`) | stack                                                                                      | server started as                          |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `zero`            | `@pyreon/zero` (workspace `lib/`)                                                          | `node dist/index.js` (node adapter)        |
| `react-router`    | React Router 8 framework mode (React Router 7 framework mode = Remix, now published as v8) | `react-router-serve build/server/index.js` |
| `next`            | Next.js 16 App Router                                                                      | `next start`                               |
| `sveltekit`       | SvelteKit 3 + adapter-node                                                                 | `node build/index.js`                      |
| `solidstart`      | SolidStart 2 (Nitro 3 node preset)                                                         | `node .output/server/index.mjs`            |
| `nuxt`            | Nuxt 4 (Nitro node-server)                                                                 | `node .output/server/index.mjs`            |
| `astro`           | Astro 7 + `@astrojs/node` standalone, one Preact island                                    | `node dist/server/entry.mjs`               |
| `tanstack-start`  | TanStack Start (React) via Nitro                                                           | `node .output/server/index.mjs`            |
| `qwik`            | Qwik City 1.20 + express adapter                                                           | `node server/entry.express.js`             |

Exact installed versions are printed with every result (`stack.json` → `packages`). Every arm installed and built; none was skipped.

**Author-judge.** Pyreon's authors wrote every arm and judge the result. Each arm follows its framework's current docs (cited at the top of every route file and in its `stack.json`); corrections from people who know a stack better are welcome.

## The app

[`CONTRACT.md`](./CONTRACT.md) is the binding spec. In short:

- `/items` — a server loader returns 100 seeded items from [`shared/data.ts`](./shared/data.ts) (one `await` on a resolved promise standing in for a database); rendered as a list of links with prices, a counter widget, and a POST form.
- `/items/:id` — its own server loader; unknown id → HTTP 404.
- the form action validates one field (3–60 chars) and either re-renders with `#form-error` or adds the item and redirects to `/items/<newId>`.
- the counter is a real client component; its documented post-mount hook sets `performance.mark('stacks:island-ready')`.

`shared/data.ts` is copied verbatim into each arm; the harness refuses to measure a copy that differs.

## Layout and install footprint

- `examples/stacks-bench/` is a private workspace package (it matches the root `examples/*` glob). It holds the harness and declares `autocannon` (pinned) plus the `@pyreon/*` packages the zero arm needs. Adding it grew the root `node_modules` by ~3.3 MB (`du -sk` 1,492,436 → 1,495,740 KB) and `bun.lock` by 113 lines.
- Each rival arm lives in `apps/<id>/` — two levels below `examples/`, so **outside** the workspace glob — with its own `package.json` (exact versions), its own `package-lock.json`, and is installed on demand by `bun setup.ts` (`npm ci` + build). A contributor's `bun install` never downloads any of it. Installed on demand, the eight rival arms take ~1.2 GB (next 355 MB, nuxt 181, tanstack-start 159, astro 153, qwik 125, react-router 100, solidstart 93, sveltekit 65).
- The zero arm (`apps/zero`) has no install of its own: Node and Vite resolve `@pyreon/*` upward through the workspace, i.e. the built `lib/` that `bun install` produces — the same artifacts a published package contains. Rebuild them (`bun scripts/bootstrap.ts`) before measuring a source change.
- The arms are excluded from the repo's oxlint/oxfmt runs: rival code follows its own framework's conventions.

## Running

```sh
cd examples/stacks-bench
bun setup.ts                    # npm ci + build every arm (or: bun setup.ts next nuxt)
bun gate.ts                     # correctness gate only, every arm
bun bench-stacks.ts             # measure every arm → results/<id>.json (or name arms)
bun bench-stacks.ts --report    # tables from results/*.json
```

`run-locked.sh <lock> [ids…]` runs one arm per invocation of a machine-wide lock script (how the first pass was taken on a shared machine). Env knobs: `STACKS_STARTS` (5), `STACKS_DURATION` (10 s), `STACKS_BSTARTS` (2), `STACKS_LOADS` (8).

## Method

Each arm runs in its own server process, started by the harness as `node <entry>` in the arm's directory with `PORT`, `HOST=127.0.0.1`, `NODE_ENV=production` (never through `npm start`, so no package-manager wrapper is in cold start). Load generators run in their own processes. Every port is checked free before a start, so a stale server cannot fake a cold start.

1. **Correctness gate** (`lib/gate.ts`, its own server start, because it mutates state): `/items` HTML (no JS) contains all 100 names, ≥100 distinct `/items/:id` links, `#counter` and a POST form; `/items/7` contains item 7's name and description; `/items/9999` is a 404; in Chromium the counter goes `Count: 0` → `Count: 1` on click, a 2-character name renders the validation error, a valid name lands on `/items/101` showing it, and a fresh server GET of `/items` lists it. A no-op arm fails every one of these.
2. **Server rows** — `STARTS` independent server starts. Each: cold start (spawn → first 200 on `/items`, polled every 5 ms) → warmup `autocannon -c 50 -d 3` (discarded) → TTFB: 200 strictly sequential requests on one keep-alive connection from a separate node process (`lib/ttfb-client.mjs`; TTFB = request written → headers parsed, TTLB = → last byte) → throughput `autocannon -c 50 -d 10` (req/s average, p50, p99). Errors/non-2xx under load are reported.
3. **Browser rows** — `BSTARTS` more server starts; each gets one untimed load (on the first start this is the script inventory), then `LOADS` timed first-visit loads, each in a **fresh browser context** (empty HTTP cache, no V8 code cache).
   - **Hydration window** = `navigationStart` → the `stacks:island-ready` mark. For a full-hydration stack the mark fires after the whole root hydrated (React `useEffect`, Svelte `onMount`, Vue `onMounted`, Solid/Pyreon `onMount`); for Astro after its one island hydrated. **Qwik does not hydrate** — it has no mount hook that runs without forcing eager JS — so it has no hydration window; its script/layout rows use `navigationStart → loadEventEnd` and its interactive cost shows up in first-click latency.
   - **Framework work vs layout**, as `examples/benchmark/bench-hydration.ts` separates the walk from layout: a Chromium trace of the window is split into _script_ (union of V8 compile/evaluate/function-call/microtask intervals on the renderer main thread, minus forced layouts nested inside them) and _layout + paint_ (style recalc, layout, pre-paint, paint). Script here is everything JS on the critical path — parse/compile of the shipped bundles, the hydration walk and the app's code — not the walk alone: these frameworks give no hook to time their walk in isolation the way bench-hydration's hand-driven fixtures can.
   - **First click → DOM change**: an in-page `click()` on the counter timed to the `Count: 1` mutation (MutationObserver). For Qwik this includes fetching the handler chunk if it was not preloaded. The page is not cross-origin isolated, so the clock is clamped to 0.1 ms; read sub-millisecond differences as ties.
4. **Bytes** (deterministic, from the inventory load): `/items` HTML raw/gzip -9/brotli 11 and its inline `<script>` bytes; every JS file the page requests until it is interactive and the network is idle, each re-fetched uncompressed and compressed by the harness. Each file is labelled `script` (a `<script src>` in the HTML), `modulepreload` (a `<link rel=modulepreload>`) or `dynamic` (requested later), and `executed` when V8 precise coverage shows its top-level code ran (coverage is taken on that separate untimed load because it deoptimizes code).

CIs are the two-stage cluster bootstrap from `examples/benchmark/cluster-bootstrap.ts` with **clusters = server starts**. For rows with one value per start (req/s, p50, p99, cold start) that is the ordinary bootstrap over starts, so with 5 starts the interval is wide by construction. A single run on a shared machine is FIRST-PASS: a verdict needs two runs with disjoint CIs.

## Fairness

- **Compression off everywhere.** autocannon and the TTFB client send no `Accept-Encoding`; the Chromium contexts send `Accept-Encoding: identity` (Chromium honours the override — verified against Next.js, which gzips by default). The report prints the `Content-Encoding` each server actually answered with under load. Servers that _would_ compress when asked: Next.js (`compress: true` default), react-router-serve (`compression()` middleware), SvelteKit adapter-node (precompressed static assets only). Astro, Nuxt, SolidStart, TanStack Start, Qwik (generated `compression()` line commented out) and zero do not compress.
- **No caching** of rendered pages in any arm; `/items` and `/items/:id` render per request (Next.js: `await connection()` makes the route dynamic; no arm prerenders them).
- **Streaming vs buffered** (as built, per `stack.json` → `streaming`): streamed — React Router, Next.js, Astro, SolidStart, TanStack Start, Qwik; buffered — zero (`ssr.mode` default `'string'`), SvelteKit (nothing streamed from `load`), Nuxt. No arm has a Suspense boundary or deferred data, so a streamed response is a shell flushed in a few chunks in one tick.
- **Node** v26.1.0 for every server; the harness itself runs on bun.
- **What each server does per request** — see "Per-arm audit notes" below. Notable: react-router-serve logs every request to stdout (`morgan('tiny')`, its default; the harness drains the pipe); Qwik runs express + static lookup first; zero's node runner tries a static file first, builds a WHATWG `Request` and pipes the `Response` body through a reader loop.
- **Data serialization differs by design**: every full-hydration stack serializes the list into the HTML for hydration (React Router turbo-stream, Next.js RSC Flight payload, SvelteKit devalue, Nuxt payload, SolidStart/zero seroval-style JSON, TanStack dehydration, Qwik's `qwik/json` state). Astro ships no list data (only the island hydrates). That is part of each framework's cost and stays in.
- **Link prefetch** is each framework's default: Next.js prefetches every in-viewport `<Link>` after hydration (the 100 item links issue RSC requests during the browser window); Nuxt prefetches route chunks on idle; SvelteKit preloads on hover (scaffold default); TanStack Start `defaultPreload: 'intent'` (scaffold default); zero `<Link>` prefetches on hover; Astro has no prefetch by default.

## Per-arm audit notes

- **zero** — the node adapter with the canonical `createServer` entry plus one app middleware. Two Pyreon defects surfaced while writing this arm (see below); both work-arounds are documented in the arm's code and neither touches the timed `/items` path beyond one regex test per request.
- **react-router** — default `entry.server`/`entry.client`; `loader`/`action` route-module exports (stripped from the client by the framework); `throw data(…, { status: 404 })`.
- **next** — server components read data directly; `useActionState` + Server Action for the form (`revalidatePath` + `redirect`, the docs' mutation pattern); `notFound()`; counter and form are client components. `next start` ignores `HOST` and binds all interfaces.
- **sveltekit** — scaffolded with `sv create --template minimal` (SvelteKit 3 uses `#lib` imports); `+page.server.ts` load and default form action (`fail(400)` / `redirect(303)`), `use:enhance`. adapter-node 6 reads the public origin from `kit.paths.origin` (the v5 `ORIGIN` env var is gone); without it the CSRF check assumes https and rejects every plain-http form POST, so the arm sets `paths.origin` to the harness URL. `formatPrice` is restated in `src/lib/price.ts` because components cannot import server modules.
- **solidstart** — scaffolded with `create-solid -s --v2 -t basic`; `query` + `"use server"` + `createAsync` with route `preload`; `action` + `useSubmission`; `<HttpStatusCode code={404}>`. Nitro `3.0.261103-rc` (npm latest; the template depends on Nitro 3).
- **nuxt** — `useFetch` against Nitro server routes (served in-process during SSR). Nuxt has no form-action primitive: the form `$fetch`-POSTs to a server route and `navigateTo`s on success; without JS the item is added but the browser shows the JSON reply.
- **astro** — frontmatter data, Astro Actions with `accept: 'form'` (failed validation answers HTTP 400 with `#form-error`; success `Astro.redirect` 302), Preact counter `client:load`. `@astrojs/preact` pulls `@preact/signals` into the island bundle.
- **tanstack-start** — scaffolded with `@tanstack/cli create --framework React --blank --deployment nitro` (Nitro `3.0.260610-beta`, the version the scaffold pins); `createServerFn` loaders; the form is a plain `<form action={fn.url}>` (no-JS path) whose submit goes through `useServerFn` (thrown `redirect` navigates, returned error shown).
- **qwik** — `routeLoader$`, `routeAction$` + `<Form>`, `<Link>`, `useSignal` counter, express adapter as generated. One deviation: `trailingSlash: false` (documented option) so the URLs match the contract instead of 301-ing `/items` → `/items/`.

## Pyreon defects found by this suite

1. **`notFound()` thrown from a (server) loader answers HTTP 500 under SSR** ("[Pyreon] SSR render failed … Error: Not Found"). `renderPage` (`packages/core/server/src/render-page.ts`) maps only the no-route-matched fallback (`isNotFound`) to 404 and rethrows every other preload rejection, so the router docs' "matched route, missing resource" pattern cannot produce a 404 page. The zero arm returns its 404 from an app middleware in `src/entry-server.ts` instead. (A route-level `middleware` export would have pulled the data module into the client bundle.)
2. **Inside this monorepo the zero SSR bundle crashes at startup unless `sharp` is external.** zero's optional `sharp` peer (lazily imported for `og` images) is resolvable only from `packages/zero/zero/node_modules`, so the SSR sub-build bundles it, and rolldown places its shared `__exportAll` runtime helper in the sharp chunk — the server entry imports that chunk statically and evaluates sharp, which then cannot find its native binary. An npm consumer should not hit this (sharp is external or absent), but a lazy optional dependency being evaluated eagerly because of chunk placement is a class worth fixing. The arm keeps `sharp` external through a forwarded Vite plugin (`vite.config.ts`).

## Limits

- One app shape (a 100-row list page with one widget). It says nothing about large pages, deep component trees, streaming with real async data, or client navigation.
- localhost: network transfer is near-free, so first-load JS cost shows up as parse/compile/execute time, not download time; bytes are reported separately for that reason.
- A shared, noisy machine; the first pass is one run.
