---
title: Full-stack benchmark method
description: How Pyreon's full-stack benchmark is built and run. One small app in @pyreon/zero and eight other meta-frameworks, what is measured, the known biases, and how to re-run or challenge it. No results are published yet.
---

Pyreon has a benchmark that builds the same small app in `@pyreon/zero` and in eight other full-stack frameworks, and measures each on its own production server. This page publishes its **method**. It does not publish results, because none meets the bar yet; [Results](#results) says why.

Everything described here is in the repository under [`examples/stacks-bench`](https://github.com/pyreon/pyreon/tree/main/examples/stacks-bench): the harness, the nine apps and their lockfiles. You can run all of it yourself.

## What it is and what it is not

It is one app, defined by a written contract, implemented once per framework, built for production and served by that framework's own documented Node server. One harness starts each server, checks that the app is correct, and then measures server and browser behaviour.

It is not:

- **An independent benchmark.** Pyreon's authors wrote the harness and every app, and they read the result. See [Known biases](#known-biases).
- **A statement about large applications.** The app is a 100-row list page with a detail route, one form and one counter. It says nothing about big pages, deep component trees, streaming with slow data, or client-side navigation.
- **A network benchmark.** Client and server run on one machine over localhost.
- **A ranking.** A single app shape cannot rank frameworks. It can only say how each one handled this page.

## The app

Every arm implements [`CONTRACT.md`](https://github.com/pyreon/pyreon/blob/main/examples/stacks-bench/CONTRACT.md):

- `/items`: a server loader returns 100 seeded items. The page renders them as a list of links with prices, a counter button, and a form that posts a new item.
- `/items/:id`: its own server loader. An unknown id answers HTTP 404 through the framework's not-found mechanism.
- The form action validates one field on the server. It re-renders with an error message, or adds the item and redirects to the new item's page.
- The counter is a real client component with state, written the way that framework's docs write a counter.

The data module is one file, copied byte for byte into every arm. The harness refuses to measure an arm whose copy differs. There is no CSS, no font, no analytics and no caching of rendered pages in any arm.

## The arms

| Arm | Stack | How it was produced | Written by |
| --- | --- | --- | --- |
| `zero` | `@pyreon/zero`, node adapter | Assembled by hand, following the Zero docs and the `create-zero` app template | Maintainer |
| `react-router` | React Router framework mode (the successor of Remix), `react-router-serve` | Assembled by hand from the framework-mode docs (no scaffold recorded), default server and client entries | Maintainer |
| `next` | Next.js App Router, `next start` | Assembled by hand from the App Router docs (no scaffold recorded), empty `next.config` | AI agent, reviewed by the maintainer |
| `sveltekit` | SvelteKit with `adapter-node` | `sv create --template minimal`, then the routes | Maintainer |
| `solidstart` | SolidStart on Nitro | `create-solid -s --v2 -t basic`, then the routes | Maintainer |
| `nuxt` | Nuxt on Nitro `node-server` | The `nuxt/starter` template, then the pages and server routes | AI agent, reviewed by the maintainer |
| `astro` | Astro with `@astrojs/node` standalone and one Preact island | Assembled by hand from the on-demand rendering, actions and integration docs (no scaffold recorded) | AI agent, reviewed by the maintainer |
| `tanstack-start` | TanStack Start (React) on Nitro | `@tanstack/cli create --framework React --blank --deployment nitro`, then the routes | Maintainer |
| `qwik` | Qwik City with the express adapter | The `empty` starter plus `qwik add express`, then the routes | AI agent, reviewed by the maintainer |

Each arm pins exact versions in its own `package.json` and commits its own `package-lock.json`, so `npm ci` installs the same tree everywhere. The versions are whatever those lockfiles say on the commit you check out; every result file records the installed versions again. Each route file and each arm's `stack.json` cite the documentation pages the arm follows, and `stack.json` lists what that arm's server does on every request.

Where an arm departs from a scaffold default, its `stack.json` says so. Two examples from rival arms: Qwik City runs with `trailingSlash: false`, a documented option, so its URLs match the contract; and SvelteKit sets `kit.paths.origin` to the harness URL, because without it the node adapter rejects a plain-HTTP form post.

### The zero arm has two sources

`bun setup.ts` installs the zero arm from **npm**: the published `@pyreon/*` packages at the exact version its lockfile pins. That is what an application installs, and it is the only source a published result may use. It can lag `main`, because the pin moves by hand after a release.

`bun setup.ts --zero=workspace` builds the arm against the monorepo's own packages instead, for measuring a change before it is released. Every run records which source it measured.

## What each framework renders, and when

No arm prerenders or caches the two routes. Each request renders the page on the server. Inside that rule the frameworks do different work, and the benchmark leaves those differences in, because they are each framework's design:

| Arm | Server response | What becomes interactive in the browser |
| --- | --- | --- |
| `zero` | Buffered | The whole page hydrates |
| `react-router` | Streamed | The whole page hydrates |
| `next` | Streamed, with the server-component payload inline | The client components hydrate (the counter and the form) |
| `sveltekit` | Buffered | The whole page hydrates |
| `solidstart` | Streamed | The whole page hydrates |
| `nuxt` | Buffered | The whole page hydrates |
| `astro` | Streamed | One island (the counter); the list ships no data and no JavaScript |
| `tanstack-start` | Streamed | The whole page hydrates |
| `qwik` | Streamed | Nothing hydrates; handlers load when used |

No arm has a suspense boundary or deferred data, so a streamed response here is one shell flushed in a few chunks. Every framework that hydrates the list also serializes the list into the HTML; that cost stays in. Links use each framework's own link component with its default prefetch behaviour, which differs: Next.js prefetches every visible link after hydration, Nuxt prefetches route chunks when idle, SvelteKit and Zero prefetch on hover, TanStack Start on intent, and Astro not at all. Prefetch requests that fire inside the browser window are part of what is measured. At build time each framework does its usual work (bundling, code splitting, and for SvelteKit precompressed copies of static assets), but none renders these two routes ahead of time.

## What is measured, and how

The harness runs on [bun](https://bun.sh). Every server runs on the same Node.js. The load generator is [autocannon](https://github.com/mcollina/autocannon) and the browser is Chromium driven by [Playwright](https://playwright.dev), both pinned in the harness's lockfile.

Arms are measured one at a time, each completely before the next, in a fixed order: zero first, then alphabetical. For each arm:

1. **Correctness gate.** On its own server start, the harness checks that `/items` holds all 100 item names, at least 100 distinct item links, the counter and a POST form; that `/items/7` shows the right item; that `/items/9999` is a 404; and in Chromium, that a click takes the counter from 0 to 1, that a too-short name shows the validation error, and that a valid name lands on the new item's page and is then listed by a fresh server request. An arm that fails is not measured.
2. **Server measurements.** Five independent server starts. Each start is: spawn the server and poll until `/items` answers 200 (cold start); a 3-second warm-up at 50 connections, discarded; 200 sequential requests on one keep-alive connection, from a separate process (time to first byte and time to last byte); then 10 seconds at 50 connections (requests per second, median and 99th-percentile latency). Errors and non-2xx responses under load are recorded.
3. **Browser measurements.** Two more server starts. Each gets one untimed page load, then eight timed first visits, every one in a fresh browser context with an empty cache.
   - *Hydration window*: navigation start to a performance mark that the counter sets in its framework's own post-mount hook. Qwik does not hydrate, so it has no hydration window; its window ends at the load event and is reported as such.
   - *Script and layout*: a Chromium trace of that window, split into JavaScript on the main thread and style, layout and paint.
   - *First click*: an in-page click on the counter, timed to the DOM change.
4. **Bytes.** The `/items` HTML, raw and compressed, and every JavaScript file the page requests until it is interactive. The harness fetches each file again and compresses it itself, so every arm is sized the same way. Each file is labelled by how the page asked for it and whether its code ran during the load.

Isolation and fairness rules:

- One server process per arm, started directly with `node`, never through a package-manager script. Load generators run in their own processes.
- The port is checked free before every start, so a leftover server cannot pass as a cold start.
- Compression is off for every arm: no client asks for it, and the report shows what each server answered. Some servers compress when asked and some do not, so leaving it on would compare compressors.
- Telemetry is disabled for the frameworks that have it.
- Confidence intervals are a cluster bootstrap with server starts as the clusters, because samples from one server process share its JIT and heap state. Rows with one value per start have wide intervals by construction.

The repository's [`README`](https://github.com/pyreon/pyreon/blob/main/examples/stacks-bench/README.md) has the per-arm audit notes and the Pyreon defects this suite found.

## Known biases

Read any number from this suite with these in mind.

- **The authors of one arm wrote all nine and judge the outcome.** The maintainer wrote five arms, including Pyreon's. AI coding agents wrote the other four from the framework docs, and the maintainer reviewed them. Nobody from a rival project has reviewed its arm. An arm written by someone who knows a framework less well than its own maintainers can be slower than it should be.
- **Rival defaults against a configured Zero.** Every rival arm runs on its scaffold or documented defaults, and none was tuned. The zero arm also uses documented defaults, but its authors know which defaults matter and worked around two Pyreon defects while writing it. That knowledge is not symmetric.
- **One machine.** The load generator and the server share one CPU, so they compete. Network transfer is close to free, so JavaScript size shows up as parse and execute time, not download time. No second machine and no second operating system has been measured.
- **A fixed order.** Arms are not shuffled or interleaved. Drift during a run lands on whichever arm is running. The harness records the machine's load average before and after every arm so that such a run can be discarded.
- **Different work per request.** The section above is the list: streamed against buffered, full hydration against one island against none, different prefetch defaults. The benchmark does not equalize them.
- **One small page.** With 100 rows and one widget, fixed costs per request and per page dominate. A framework that pays more up front and less per component looks worse here than it would on a large page, and the reverse.
- **The published Zero lags `main`.** The npm source measures the last release.

## Re-running it

You need bun (the version in the repository's `.bun-version`), Node.js 24.15 or newer with npm, and git. Chromium, autocannon and Playwright are installed by the commands below. Allow about 3 GB of disk.

```bash
git clone https://github.com/pyreon/pyreon.git && cd pyreon
bun install --ignore-scripts          # the harness's dependencies; skips building the monorepo
bunx playwright install chromium      # on Linux: bunx playwright install --with-deps chromium
cd examples/stacks-bench
bun setup.ts                          # npm ci + production build of all nine arms
bun gate.ts                           # correctness gate, every arm; prints no timing
```

Then, on a quiet machine:

```bash
bun bench-stacks.ts --wait-quiet 4    # measure every arm
bun bench-stacks.ts --report          # tables for that run, and whether it is publishable
```

Setup takes about ten minutes on a fast connection and a full run about twenty. Each run writes a directory, `results/<runId>/`, with a manifest (machine, tool versions, the repository commit, settings, arm order) and one JSON file per arm holding every raw sample. [`results/README.md`](https://github.com/pyreon/pyreon/blob/main/examples/stacks-bench/results/README.md) documents both files field by field.

A CI job builds every arm from its lockfile on Linux and runs the correctness gate, on each pull request that touches the benchmark and once a week. It measures nothing; it keeps the commands above working.

## Challenging an arm

If an arm does not use its framework the way that framework should be used, we want to know. Open an issue or a pull request on [pyreon/pyreon](https://github.com/pyreon/pyreon/issues) against `examples/stacks-bench/apps/<arm>/`.

A correction is accepted when it follows the framework's documentation, keeps the contract, and passes `bun gate.ts <arm>`. Tuning beyond a framework's documented production setup is out of scope for every arm, Zero included. Corrections to the harness, the contract or this page are welcome in the same way.

## Results

**None are published.** The suite has only been run on a shared development machine that was under load, to check that the harness works. Those numbers are not good enough to publish, so they are not on this page, in the repository's benchmark record, or anywhere on this site.

A run is publishable when:

- the machine is quiet, with the load average under a stated ceiling before and after every arm;
- all nine arms are measured in one run, on one machine, in one session;
- the harness defaults are used, or more samples;
- the run names a clean commit of the repository, and the zero arm is installed from npm;
- no arm returned an error under load;
- at least two such runs exist. A row counts as a win or a loss only when the confidence intervals are disjoint in every run; anything else is a tie;
- the machine, operating system and every version are stated, and the raw run files are committed with the numbers.

The report command checks the conditions a single run can show and prints "not publishable" with the reason when one fails. When results are published, the losses will be listed with the wins, and first. Until then, [Benchmarks](/docs/benchmarks) carries the suites that do have published results.
