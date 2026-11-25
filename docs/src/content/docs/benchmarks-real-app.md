---
title: Real-app benchmark method
description: How Pyreon's realistic client-app benchmark is built and run. One catalogue app in Pyreon, React, Vue, Solid, Svelte and Preact; first-load bytes, time to interactive and memory; the known biases; how to re-run or challenge it. No results are published yet.
---

Most of Pyreon's published benchmarks time synthetic operations: create 1,000 rows, swap two rows, update a signal. Those numbers drove most of the framework's micro-optimisation, and they say little about what a person using an app notices. This benchmark builds one small but realistic app in six frameworks and measures what a first visit costs: the bytes it downloads, how long until it responds to input, and the memory it keeps. This page publishes its **method**. It does not publish results, because none meets the bar yet; [Results](#results) says why.

Everything described here is in the repository under [`examples/real-bench/app`](https://github.com/pyreon/pyreon/tree/main/examples/real-bench/app): the contract, the harness and the six apps with their lockfiles. You can run all of it yourself.

## What it is and what it is not

It is one client-rendered app, defined by a written contract, implemented once per framework with that framework's own router and state approach, built for production with that framework's own Vite plugin, and served by one static server the harness controls.

It is not:

- **An independent benchmark.** Pyreon's authors wrote the harness and every app, and they read the result. See [Known biases](#known-biases).
- **A server-rendering benchmark.** Every arm renders in the browser. Server rendering and hydration are measured by the [full-stack benchmark](/docs/benchmarks-full-stack).
- **A statement about large applications.** The app has four views and a few thousand records. It says nothing about apps with hundreds of routes or deep component trees.
- **A ranking.** One app cannot rank frameworks. It can only say how each one handled this app.

## The app

Every arm implements [`CONTRACT.md`](https://github.com/pyreon/pyreon/blob/main/examples/real-bench/app/CONTRACT.md), which fixes the routes, the exact DOM each view renders and the behaviour:

- `/products`: 5,000 seeded products with a search box, a category filter, a sort order, a summary of the filtered set (total stock and average price), a table of 50 rows per page with previous and next buttons, and a favourite toggle on every row.
- `/products/:id`: the product's details and its favourite toggle. An unknown id shows a not-found view.
- `/products/new`: a four-field form. Errors appear after the first submit and then update as the user types. A valid submit adds the product and opens its page.
- A header on every view with links to the list and the form, and the number of favourites.

The filters, the current page and the favourites live in app-wide state, so they survive navigating to a detail page and back. All navigation is client-side.

One data module and one stylesheet are copied byte for byte into every arm. The module generates the records from a fixed seed and holds the filter predicate, the sort comparators, the summary, the validation rules and every string the app shows, numbers included. What differs between arms is only how each framework holds the state, derives from it, routes and renders, which is what the benchmark compares. The harness refuses an arm whose copy differs.

## The arms

| Arm | Router | Shared state |
| --- | --- | --- |
| `pyreon` | `@pyreon/router`, history mode | `@pyreon/store` with signals and computeds |
| `react` | React Router, declarative mode | `useReducer` and context, `useMemo` for the filtered list |
| `vue` | Vue Router | A Pinia setup store with `ref` and `computed`; single-file components |
| `solid` | `@solidjs/router` | `createStore` and `createSignal` in a context provider, `createMemo` |
| `svelte` | SvelteKit in single-page mode | A class with `$state` fields and `$derived` values |
| `preact` | `preact-iso` | `@preact/signals` shared through context |

Each arm is written the way its framework's documentation writes these things, with no optimisation an ordinary app of this size would not have: no `memo`, no `shallowRef` or `$state.raw`, no virtualised list, no hand-written compiler output, no form library. Each arm's `arm.json` names the documentation pages it follows and states where it differs from the others. Every arm pins exact versions and commits its own `package-lock.json`. The other frameworks' packages were each published at least two weeks before they were pinned; the Pyreon arm pins the latest `@pyreon/*` release, moved by hand after each release.

### The Pyreon arm has two sources

`bun setup.ts` installs the Pyreon arm from **npm**: the published `@pyreon/*` packages at the version its lockfile pins. That is what an application installs, and it is the only source a published result may use. `bun setup.ts pyreon --pyreon=workspace` builds the arm against the repository's own packages instead, for measuring a change before it is released. Every run records which source it measured.

The pinned release, 0.54.0, passes the correctness gate, and CI gates the published packages on every change to the app. The release before it, 0.53.0, did not: the two links in the app's header reloaded the whole page instead of navigating on the client, because a compiled template that is a child of a component (here the header's `<nav>`, a child of the router's provider) was built before the provider had run, so the links inside it found no router. Pull request #4174 fixed that, with a regression test, and 0.54.0 is the first release with the fix. The arm was not changed to work around it.

## What is measured, and how

The harness runs on [bun](https://bun.sh) and drives Chromium through [Playwright](https://playwright.dev). Every arm is served by the same small static server: brotli or gzip chosen by the browser's request, compressed once at start; the app's page for every path without a file extension; no caching; cross-origin isolated, which gives the page a 5 µs clock. Every page is opened in a fresh browser context, so every load is a first visit with an empty cache.

1. **Correctness gate.** Before any measurement, each arm is loaded directly at six URLs (the list, a deep-linked product, the form, an unknown id, a malformed id and an unknown path) and must show the expected view. Then one page runs a scripted session twice: search, filter, sort, go to page 2, favourite a row, open it, unfavourite it, go back with the filters and page kept, change the sort (which returns to page 1), submit the form empty, fix it field by field, create the product, find it in the list and reset. After every step the harness checks the whole expected state of the page, computed from the shared data module. A console error, an uncaught error or a full page reload fails the arm, and an arm that fails is not measured.
2. **Bytes.** One unthrottled load of `/products`. Every file the page requests until the list is shown and the network is idle is fetched again uncompressed and compressed by the harness (gzip level 9, brotli quality 11), so every arm is sized the same way. The report gives JavaScript, CSS and HTML separately, and also every JavaScript and CSS file in the build output, which shows what an arm leaves for later routes.
3. **Time to interactive.** Fifteen loads per arm under a mobile throttle: the CPU slowed four times and the network at 150 ms round trip, 1.6 Mbit/s down and 0.75 Mbit/s up, both applied by Chromium. A small script that runs before the app watches the product count. When the list first appears, it types a search query in a new task, the way a keystroke arrives. **Time to interactive is the time from navigation start until the count shows the filtered result.** If the app has not reacted 50 ms later, the script types again and counts the retry; a run with any retry cannot be published. First contentful paint, the load event, long tasks and the bytes transferred are recorded too.
4. **Memory.** Three unthrottled pages per arm. Each loads `/products`, waits for the list and an idle network, forces garbage collection until the heap stops shrinking, and reads the JavaScript heap and the DOM node and listener counts. The same page then runs the scripted session, and the reading is repeated after one session and after five. Every page also measures an empty page from the same server, so the report can show each arm's heap net of what any page costs.

Arms are measured in rounds, one page per arm per round, with the order rotated every round, so drift during a run spreads over all arms. The machine's load average is recorded before every round.

## Known biases

Read any number from this benchmark with these in mind.

- **The authors of one arm wrote all six and judge the outcome.** Nobody from a rival project has reviewed its arm. An arm written by someone who knows a framework less well than its own maintainers can be slower than it should be.
- **Idiomatic means different.** Each arm holds state the way its docs do. Vue and Svelte make the 5,000 records deeply reactive; Solid keeps favourites per id in a store; Pyreon, React and Preact replace a set. These differences are what the benchmark compares, and each arm states them.
- **Different router defaults.** Pyreon's router uses View Transitions for navigation where the browser supports them; SvelteKit preloads links on hover; the other routers do neither. SvelteKit also splits its code per route by default, so its first load is several files where the other arms ship one.
- **A synthetic keystroke.** The input the probe types is dispatched by script, not by the operating system. It is the same for every arm.
- **The DOM, not the screen.** Time to interactive ends when the page's DOM shows the result, before it is painted.
- **Emulated throttling.** A CPU slowdown on a desktop and an emulated network are not a phone on a mobile network.
- **One browser, one machine.** No other browser and no second machine has been measured.

## Re-running it

You need bun (the version in the repository's `.bun-version`), Node.js 24 or newer with npm, and git.

```bash
git clone https://github.com/pyreon/pyreon.git && cd pyreon
bun install                            # the harness's dependencies and the monorepo's packages
bunx playwright install chromium       # on Linux: bunx playwright install --with-deps chromium
cd examples/real-bench/app
bun setup.ts                           # npm ci + production build of all six arms
bun gate.ts                            # correctness gate, every arm; prints no timing
```

Then, on a quiet machine:

```bash
bun bench.ts --wait-quiet 4            # gate, then bytes, time to interactive and memory
bun bench.ts --report                  # tables for that run, and whether it is publishable
```

Each run writes a directory, `results/<runId>/`, with a manifest (machine, tool versions, the repository commit, settings, the throttle, the clock, load stamps) and one JSON file per arm holding every raw sample. [`results/README.md`](https://github.com/pyreon/pyreon/blob/main/examples/real-bench/app/results/README.md) documents both files field by field.

A CI job builds every arm from its lockfile on Linux and runs the correctness gate, on each pull request that touches the benchmark and once a week. It measures nothing; it keeps the commands above working.

## Challenging an arm

If an arm does not use its framework the way that framework should be used, we want to know. Open an issue or a pull request on [pyreon/pyreon](https://github.com/pyreon/pyreon/issues) against `examples/real-bench/app/arms/<arm>/`.

A correction is accepted when it follows the framework's documentation, keeps the contract, and passes `bun gate.ts <arm>`. Tuning beyond what the framework's documentation shows for an ordinary app is out of scope for every arm, Pyreon included.

## Results

**None are published.** The harness has only been run once, with one load per arm on a shared machine under load, to check that it works. Those numbers were discarded; they are not on this page, in the repository's benchmark record, or anywhere on this site.

A run is publishable when:

- the machine is quiet, with the load average at or under 4 at every stamp;
- all six arms are measured in one run, on one machine;
- the harness defaults and the default throttle are used;
- the clock is the isolated 5 µs one;
- the run names a clean commit of the repository, and the Pyreon arm is installed from npm;
- no time-to-interactive load needed a retry;
- at least two such runs exist. A cell counts as a win or a loss only when the confidence intervals are disjoint in every run; anything else is a tie;
- the machine, operating system and every version are stated, and the raw run files are committed with the numbers.

The report command checks the conditions a single run can show and prints "not publishable" with the reason when one fails; the measuring command refuses outright to run on a coarse clock or against an arm that fails the gate. When results are published, the losses will be listed with the wins, and first. Until then, [Benchmarks](/docs/benchmarks) carries the suites that do have published results.
