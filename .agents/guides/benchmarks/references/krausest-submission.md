# The official js-framework-benchmark entry

`contrib/krausest/pyreon-keyed/` is the entry staged for [krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), the only venue where someone else measures Pyreon. It is copied unchanged to `frameworks/keyed/pyreon` upstream. This file holds upstream's rules, how the repo keeps the entry inside them, how to re-run upstream's own checks, and the steps for the maintainer.

**Opening the upstream pull request is the maintainer's decision and action.** An agent never forks, pushes to, or opens a pull request, issue or comment on the upstream repository.

**No official number exists yet.** Nothing has been submitted. A duration seen while running upstream's checks on a development machine is not a result; do not write one down.

## Upstream's rules

Read from upstream's README, its "Process for merging a pull request" and CSP wiki pages, its `cli/` and `webdriver-ts/` sources, and merged pull requests #2141, #2146 and #2158 (upstream `master` at `b010a54`, 2026-11-15). Re-read them before a submission; they change.

| Rule | Detail |
| --- | --- |
| Keyed only | Non-keyed entries were retired with the Chrome 156 run. |
| Directory | `frameworks/keyed/<name>/`. A pull request touches only that folder: no result files, no root `index.html`. |
| Build | `npm ci --ignore-scripts` then `npm run build-prod` (what `npm run rebuild-ci keyed/<name>` runs when a lockfile is committed, which upstream recommends). A dependency that needs an install script to work will not build. |
| Versions | Exact versions in `package.json`, no ranges. |
| Lockfile | `package-lock.json`, with every `resolved` URL under `https://registry.npmjs.org/`; `rebuild-ci` refuses any other registry. |
| Metadata | `package.json` → `"js-framework-benchmark"`: `frameworkVersionFromPackage` (the displayed version is read from the lockfile entry of that package; join several with `:`), `frameworkHomeURL`, `repoURL` (used for the rule that archives an entry after a year without repository activity), `language`. Optional: `issues` (array of flag numbers), `customURL`, `useShadowRoot`, `includeInBuild`. |
| Dependencies | All local, none from a CDN. No web server among them. Bootstrap comes from the shared `/css/currentStyle.css`. |
| Markup | Identical to the `vanillajs` reference: button ids `run`, `runlots`, `add`, `update`, `clear`, `swaprows`; `table.table.table-hover.table-striped.test-data`; no shadow DOM; the preload icon `<span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true">`. `isKeyed` requires row 1000 to hold exactly the elements `td, td, a, td, a, span, td` with classes `col-md-1`, `col-md-4`, `col-md-1`, `col-md-6`, and `glyphicon glyphicon-remove` plus `aria-hidden="true"` on the span. It compares elements only, so comment markers do not fail it. |
| Row ids | Start at 1 and keep counting until the page reloads; the driver finds rows by id text. |
| Keyed behaviour | Create replaces all 1,000 `<tr>`, remove removes that row's node, swap moves the two nodes without creating any. |
| CSP | The page must work under `Content-Security-Policy: default-src 'self'`: no inline script or style, no `eval`. An entry that cannot must declare flag 1139, and `checkCSP` fails when the declaration and the behaviour disagree. |
| Style | "Please don't over-optimize": write the framework's idiomatic form. |

### Flags

Upstream shows a flag next to an entry's result. An error means the entry is wrong; a note means it took a shortcut.

| Flag | Meaning | Pyreon's entry |
| --- | --- | --- |
| #634 (error) | HTML differs from the reference | Not declared: `isKeyed` passes its structure check. |
| #694 (error) | Not actually keyed | Not declared: keyed for run, remove and swap. |
| #772 (note) | Manual DOM manipulation in client code | Not declared: the source touches the DOM once, `document.getElementById('main')` as the mount target. |
| #796 (note) | Explicit `requestAnimationFrame` in client code | Not declared: none. |
| #800 (note) | A selection flag on every row | Not declared: one `selected` signal for the table, read through `createSelector`. |
| #801 (note) | Explicit event delegation in client code | Not declared: each row writes `onClick`. The compiler and runtime delegate those handlers, which upstream allows ("frameworks themselves are free to use event delegation"). |
| #1139 (note) | Fails strict CSP | Not declared: `checkCSP` passes. |
| #1261 (note) | Manual caching of DOM or virtual-DOM nodes | Not declared: none. |

The entry declares no flag because none applies. If a technique that carries a flag is ever added, declare the flag in `"js-framework-benchmark".issues` in the same change; `check-krausest-entry` fails when `requestAnimationFrame`, `addEventListener` or a DOM-mutation call appears in the source without its flag. The upstream maintainer may still add a note at his own judgment.

## What the repo enforces

`bun scripts/check-krausest-entry.ts` runs in `validate-fast` (and so in CI). It is offline and fails when:

- a dependency is a range or `workspace:`, or the `@pyreon/*` dependencies are on different versions;
- `package-lock.json` is missing, is not npm's, disagrees with `package.json`, holds a transitive `@pyreon/*` package on another version, or resolves outside the public registry;
- a `js-framework-benchmark` field or the `build-prod` script is missing;
- the pin is older than the release before the workspace version;
- the row template the real compiler emits for `src/main.tsx`, a button id, the table classes, the preload icon or the stylesheet link no longer match the contract;
- a flagged technique is used but not declared;
- the entry's row template and the local bench arm (`examples/benchmark/src/impl/pyreon.tsx`) use different idioms for the list, the key, the selected-row class, the id cell or the label. The id cell is `{row.id}` in both: `String(row.id)` grows V8's smi-string cache and is charged to the arm in memory rows;
- `README-SUBMISSION.md` restates a version.

The gate does not install from npm or open a browser. Upstream's checks below do, and they are run by hand.

### The pin

`bun scripts/sync-krausest-pin.ts` pins every `@pyreon/*` dependency to the newest release npm serves and regenerates the lockfile with `npm install --package-lock-only --ignore-scripts`. A lockfile can only name a published version, and a release pull request bumps the workspace before publishing, so the script runs inside `version-packages` and moves the pin to the release published just before. The entry therefore trails the workspace by at most one release. Run the script by hand before submitting to pin the current release.

## Re-running upstream's checks

Needs Node, npm and Google Chrome. Upstream's code and its dependencies are downloaded code: clone it outside this repository and install with `--ignore-scripts`. Machine load does not matter for these checks; they are pass or fail.

```sh
JFB=<empty directory outside the repository>
ENTRY=<repository>/contrib/krausest/pyreon-keyed

git clone --depth 1 https://github.com/krausest/js-framework-benchmark.git "$JFB"
mkdir "$JFB/frameworks/keyed/pyreon"
cp -R "$ENTRY"/index.html "$ENTRY"/package.json "$ENTRY"/package-lock.json \
  "$ENTRY"/tsconfig.json "$ENTRY"/vite.config.ts "$ENTRY"/src "$JFB/frameworks/keyed/pyreon/"

cd "$JFB"
npm ci --ignore-scripts              # add --legacy-peer-deps if npm 11 reports ERESOLVE on upstream's lint tooling
(cd server && npm ci --ignore-scripts)
(cd webdriver-ts && npm ci --ignore-scripts && npm run compile)

(cd server && PORT=18431 npm start) &   # any free port; the driver reads the same PORT
PORT=18431 npm run rebuild-ci keyed/pyreon
kill %1
```

`rebuild-ci` deletes the entry's `node_modules` and `dist`, runs `npm ci --ignore-scripts` and `npm run build-prod`, then three checks from `webdriver-ts`. It must end with `All checks are fine!` and exit 0:

| Step | Command it runs | Passing output |
| --- | --- | --- |
| Smoke | `npm run bench -- --runner playwright --headless true --smoketest true keyed/pyreon` | `successful run`. One iteration of every benchmark, with result files switched off; it proves the driver finds every selector. |
| Keyed and markup | `npm run isKeyed -- --runner playwright --headless true keyed/pyreon` | `pyreon-v<version>-keyed is keyed for 'run benchmark' and keyed for 'remove row benchmark' and keyed for 'swap rows benchmark'`, with no `ERROR` line. |
| CSP | `npm run checkCSP -- --headless true keyed/pyreon` | `checking keyed/pyreon` with no `CSP test failed` line and no `ERROR` line. It exits 0 on a load failure too, so read the output. |

Each can be run alone from `webdriver-ts/` with the same `PORT`. Then `bun contrib/krausest/smoke.mjs "$JFB/frameworks/keyed/pyreon"` from this repository drives the same built page through all eight operations and checks that the id cell is one text node holding the bare integer.

Last run: 2026-11-24, upstream `0f4e789`, Pyreon 0.54.0, Chrome 158 on macOS arm64. `npm ci --ignore-scripts` + `npm run build-prod` (only `dist/main.js`), the keyed check, the CSP check and `smoke.mjs` passed. Upstream's smoke step was not run that day (it runs the benchmark driver; leave it to the maintainer's `rebuild-ci` on a quiet machine); the previous run (2026-11-17, upstream `b010a54`, Pyreon 0.53.0, Chrome 157) recorded all four checks passing. Linux, where upstream builds, was not run; the lockfile carries the compiler's Linux binaries as optional dependencies.

When `sync-krausest-pin.ts` regenerates the lockfile it passes `--prefer-online`: the compiler's platform binaries are published after the JS packages, and from a cache filled in between npm wrote version-less entries for two of them (0.54.0), which the gate rejects.

## Submission steps (maintainer)

1. `bun scripts/sync-krausest-pin.ts`, then `bun scripts/check-krausest-entry.ts --online` (also checks the pin against npm's latest). Commit any change here first.
2. Re-run upstream's checks as above, against upstream's current default branch.
3. Do a dry run of the timed benchmark on a quiet machine before submitting: `npm run bench -- keyed/pyreon keyed/vanillajs keyed/solid keyed/vue-vapor keyed/octane keyed/svelte` in one session, then `npm run results`. The local board does not predict the official one (trace-based timing through paint, CPU throttling, four-cell rows under Bootstrap, memory, startup and size columns). If the dry run contradicts a claim on the site or in `BENCHMARKS.md`, correct the claim first.
4. Fork upstream, create a branch, and copy the entry to `frameworks/keyed/pyreon/`: `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts` and `src/`. Leave `README-SUBMISSION.md` behind; `LICENSE` is optional.
5. Commit only that folder. Do not commit `dist/`, `node_modules/` or any result file.
6. Open the pull request. Recent accepted ones state: the framework and its home page, the pinned version, that `npm run rebuild-ci keyed/pyreon` passes (build, smoke run, keyed check, CSP check), and that the code is idiomatic with respect to #772, #796, #800 and #801.
7. Upstream merges in batches, usually within ten days, and posts a preliminary result screenshot on the pull request. The official table is regenerated per Chrome release.
8. After each Pyreon release worth re-measuring, send a small "bump Pyreon to x.y.z" pull request with the new `package.json` and `package-lock.json`. The official number describes the pinned version until then.
