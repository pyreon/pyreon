# stacks-bench — full-stack meta-frameworks vs `@pyreon/zero`

The same small app in each stack, built for production and served by that framework's own documented Node server, measured by one harness:

| arm (`apps/<id>`) | stack                                                                                      | server started as                          |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `zero`            | `@pyreon/zero`, from npm by default or from the workspace's `lib/`                         | `node dist/index.js` (node adapter)        |
| `react-router`    | React Router 8 framework mode (React Router 7 framework mode = Remix, now published as v8) | `react-router-serve build/server/index.js` |
| `next`            | Next.js 16 App Router                                                                      | `next start`                               |
| `sveltekit`       | SvelteKit 3 + adapter-node                                                                 | `node build/index.js`                      |
| `solidstart`      | SolidStart 2 (Nitro 3 node preset)                                                         | `node .output/server/index.mjs`            |
| `nuxt`            | Nuxt 4 (Nitro node-server)                                                                 | `node .output/server/index.mjs`            |
| `astro`           | Astro 7 + `@astrojs/node` standalone, one Preact island                                    | `node dist/server/entry.mjs`               |
| `tanstack-start`  | TanStack Start (React) via Nitro                                                           | `node .output/server/index.mjs`            |
| `qwik`            | Qwik City 1.20 + express adapter                                                           | `node server/entry.express.js`             |

Exact installed versions are written into every result (`stack.json` → `packages`). Every arm installs and builds; none is skipped.

**No result is published.** This directory holds the method and the apps so that anyone can run the suite and check it. [`results/README.md`](./results/README.md) says what a run writes and what a run must meet before its numbers are published. The docs site carries the same method for readers: [Full-stack benchmark method](https://pyreon.dev/docs/benchmarks-full-stack).

**Author-judge.** Pyreon's authors wrote every arm and judge the result. The maintainer wrote the zero, React Router, SvelteKit, SolidStart and TanStack Start arms. AI coding agents wrote the Next.js, Nuxt, Astro and Qwik arms from the framework docs, and the maintainer reviewed them. Nobody from a rival project has reviewed its arm. Each arm follows its framework's current docs (cited at the top of every route file and in its `stack.json`). See [Challenging an arm](#challenging-an-arm).

## The app

[`CONTRACT.md`](./CONTRACT.md) is the binding spec. In short:

- `/items` — a server loader returns 100 seeded items from [`shared/data.ts`](./shared/data.ts) (one `await` on a resolved promise standing in for a database); rendered as a list of links with prices, a counter widget, and a POST form.
- `/items/:id` — its own server loader; unknown id → HTTP 404.
- the form action validates one field (3–60 chars) and either re-renders with `#form-error` or adds the item and redirects to `/items/<newId>`.
- the counter is a real client component; its documented post-mount hook sets `performance.mark('stacks:island-ready')`.

`shared/data.ts` is copied verbatim into each arm; the harness refuses to measure a copy that differs.

## Layout and install footprint

- `examples/stacks-bench/` is a private workspace package (it matches the root `examples/*` glob). It holds the harness and declares `autocannon` (pinned) plus the `@pyreon/*` packages the zero arm needs. Adding it grew the root `node_modules` by ~3.3 MB (`du -sk` 1,492,436 → 1,495,740 KB) and `bun.lock` by 113 lines.
- Each arm lives in `apps/<id>/` — two levels below `examples/`, so **outside** the workspace glob — with its own `package.json` (exact versions), its own `package-lock.json`, and is installed on demand by `bun setup.ts` (`npm ci` + build). A contributor's `bun install` never downloads any of it. Installed on demand, the eight rival arms take ~1.2 GB (next 355 MB, nuxt 181, tanstack-start 159, astro 153, qwik 125, react-router 100, solidstart 93, sveltekit 65).
- The zero arm (`apps/zero`) has two sources for its `@pyreon/*` packages, and every run records which one it measured (`run.json` → `zeroSource`):
  - **npm (the default, `bun setup.ts`)**: `npm ci` from `apps/zero/package-lock.json`, which pins the published packages at one exact version. This is what an app installs, it needs no built workspace, and it is the only source a published result may use. The pin moves by hand: `cd apps/zero && npm install --save-exact @pyreon/core@<v> @pyreon/head@<v> @pyreon/reactivity@<v> @pyreon/router@<v> @pyreon/runtime-dom@<v> @pyreon/runtime-server@<v> @pyreon/server@<v> @pyreon/zero@<v> && npm install --save-exact --save-dev @pyreon/vite-plugin@<v>`, then `bun setup.ts zero && bun gate.ts zero`.
  - **workspace (`bun setup.ts --zero=workspace`)**: no install in the arm. Node and Vite resolve `@pyreon/*` upward to the workspace's built `lib/`, which `bun install` at the repo root produces. Rebuild it (`bun scripts/bootstrap.ts`) before measuring a source change. This is for development.
- Both sources declare exactly the `@pyreon/*` dependencies `create-zero` writes into a new app (`packages/zero/create-zero/src/generators/package-json.ts`), **including `@pyreon/runtime-server`**: the vite plugin turns on the compile-to-string SSR fast path (`ssrTemplate`) only when that package resolves from the app, and silently falls back to the `h()` SSR walk in a production build when it does not. An earlier draft of this harness omitted it and measured zero on the slow path, a handicap the scaffold does not have.
- The arms are excluded from the repo's oxlint/oxfmt runs: rival code follows its own framework's conventions.

## Running

### Prerequisites

| Tool                          | Version                                  | Why                                                                                                                      |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [bun](https://bun.sh)         | the version in the repo's `.bun-version` | runs the harness and installs its own dependencies                                                                       |
| [Node.js](https://nodejs.org) | 24.15 or newer, with its `npm`           | serves every arm, and `npm ci` installs them. The harness stops on an older Node (SolidStart 2 and Nuxt 4 set the floor) |
| Chromium                      | the build Playwright downloads           | correctness gate and browser rows                                                                                        |
| git                           | any                                      | the run manifest records the commit                                                                                      |

The load generator ([autocannon](https://github.com/mcollina/autocannon)) and Playwright are pinned dependencies of the harness package; `bun install` fetches them. Nothing else is installed globally. About 3 GB of disk is used (the repository's `node_modules`, the nine arms and Chromium). macOS and Linux are supported; Windows is untested.

### Build every arm

```sh
git clone https://github.com/pyreon/pyreon.git && cd pyreon
bun install --ignore-scripts              # the harness's own dependencies; skips building the monorepo
bunx playwright install chromium          # on Linux: bunx playwright install --with-deps chromium
cd examples/stacks-bench
bun setup.ts                              # npm ci + production build of all nine arms
bun gate.ts                               # correctness gate for every arm; prints no timing
```

`bun setup.ts` takes arm ids (`bun setup.ts next nuxt`) and `--zero=workspace` (see above; that source needs a plain `bun install`, without `--ignore-scripts`, so the monorepo's packages are built). Expect about ten minutes for the first setup on a fast connection, most of it `npm ci`, and under a minute for the gate.

### Run the benchmark

```sh
bun bench-stacks.ts --wait-quiet 4        # measure every arm → results/<runId>/
bun bench-stacks.ts --report              # tables of the newest run, and whether it is publishable
```

A full run with the defaults takes about twenty minutes. It measures the arms one after another in a fixed order (zero first, then alphabetical by id). `--wait-quiet [maxLoad]` waits before every arm until the 1-minute load average is at or under the ceiling. Name arms to measure a subset (`bun bench-stacks.ts zero next`); such a run is for development and is reported as not publishable.

Settings: `STACKS_STARTS` (5), `STACKS_DURATION` (10 s), `STACKS_BSTARTS` (2), `STACKS_LOADS` (8). `STACKS_RUN_ID` makes several invocations write into one run directory; `run-locked.sh <lock> [ids…]` uses it to run one arm per invocation of a machine-wide lock script on a shared machine.

### Output

Each run writes `results/<runId>/run.json` (machine, tool versions, harness commit, settings, arm order) and `results/<runId>/<arm>.json` (every raw sample). [`results/README.md`](./results/README.md) documents both files field by field, and the conditions a publishable run must meet. `results/` is ignored by git.

### CI

`.github/workflows/stacks-bench-smoke.yml` builds every arm from its lockfile on Linux and runs the correctness gate, for the zero arm from both sources. It runs on pull requests that touch this directory and once a week. It times nothing; its only job is to keep the arms building and correct.

## Method

Arms are measured one at a time, each completely before the next. Each arm runs in its own server process, started by the harness as `node <entry>` in the arm's directory with `PORT`, `HOST=127.0.0.1`, `NODE_ENV=production` (never through `npm start`, so no package-manager wrapper is in cold start). Load generators run in their own processes. Every port is checked free before a start, so a stale server cannot fake a cold start.

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
- **One Node for every server**: the `node` on `PATH`, 24.15 or newer, recorded in every result. The harness itself runs on bun.
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

1. **`notFound()` thrown from a (server) loader answers HTTP 500 under SSR** ("[Pyreon] SSR render failed … Error: Not Found"). `renderPage` (`packages/core/server/src/render-page.ts`) maps only the no-route-matched fallback (`isNotFound`) to 404 and rethrows every other preload rejection, so the router docs' "matched route, missing resource" pattern cannot produce a 404 page. The zero arm returns its 404 from an app middleware in `src/entry-server.ts` instead. (A route-level `middleware` export would have pulled the data module into the client bundle.) Fixed on `main` by #4241, after the release the npm source pins; the middleware stays until the pinned version contains the fix, so both sources run the same arm.
2. **Inside this monorepo the zero SSR bundle crashes at startup unless `sharp` is external.** zero's optional `sharp` peer (lazily imported for `og` images) is resolvable only from `packages/zero/zero/node_modules`, so the SSR sub-build bundles it, and rolldown places its shared `__exportAll` runtime helper in the sharp chunk — the server entry imports that chunk statically and evaluates sharp, which then cannot find its native binary. An npm consumer should not hit this (sharp is external or absent), but a lazy optional dependency being evaluated eagerly because of chunk placement is a class worth fixing. The arm keeps `sharp` external through a forwarded Vite plugin (`vite.config.ts`).
3. **A production build silently drops the SSR fast path when `@pyreon/runtime-server` is not resolvable from the app.** `ssrTemplate`'s auto mode warns only in `vite dev`; `vite build` falls back to the uncompiled `h()` SSR walk without a word. `create-zero` declares the dependency, so scaffolded apps are fine, but an app assembled by hand (as this harness first was) pays the slow path invisibly. The build should say so.

## Known biases

- **The authors of one arm wrote all nine and judge the result** (see the top of this file). An arm written by someone who knows that framework less well than its maintainers can be slower than it should be, and nobody outside has checked.
- **Rival defaults against a configured zero.** Every rival runs on its scaffold or documented defaults; none was tuned. The zero arm also uses documented defaults, but its authors know which defaults matter, and the two work-arounds below exist because they hit Pyreon defects. That knowledge is not symmetric.
- **One machine, localhost.** Client and server share the CPU, so the load generator competes with the server it measures. Network transfer is near-free, so first-load JS shows up as parse, compile and execute time, not download time.
- **A fixed arm order.** Arms are not interleaved or shuffled, so drift over the run (thermal state, background work) lands on whichever arm runs then. The load average around every arm is recorded for that reason.
- **Different work per request, by design.** Six arms stream and three buffer; full-hydration stacks serialize the list into the HTML, Astro hydrates one island and ships no list data, Qwik hydrates nothing. Each framework's default link prefetch differs. See [Fairness](#fairness).
- **The app favours nobody on purpose, which is itself a choice.** One 100-row list page with one widget is small enough that fixed per-request and per-page costs dominate.

## Challenging an arm

If an arm is not how its framework should be used, say so: open an issue or a pull request on [pyreon/pyreon](https://github.com/pyreon/pyreon) against `examples/stacks-bench/apps/<id>/`. A correction is welcome when it follows the framework's documentation, keeps [`CONTRACT.md`](./CONTRACT.md) and passes `bun gate.ts <id>`. Arm-specific tuning beyond a framework's documented production setup is out of scope for every arm, zero included. A pull request that changes an arm runs the CI smoke job.

## Dependencies

Every arm pins exact versions in its own lockfile, and each result records what was installed. A version bump changes what is measured, so bumps land as their own pull requests, with `bun setup.ts <id> --reinstall && bun gate.ts <id>` run for the arm. The arms are never deployed; a security advisory against one is handled by bumping to the patched version when one exists.

## Limits

- One app shape (a 100-row list page with one widget). It says nothing about large pages, deep component trees, streaming with real async data, or client navigation.
- localhost: network transfer is near-free, so first-load JS cost shows up as parse/compile/execute time, not download time; bytes are reported separately for that reason.
- No result is published. The only runs so far were taken on a shared machine under load to check the harness.
