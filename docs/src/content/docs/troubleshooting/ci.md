---
title: "CI / Build Gate Mistakes"
description: "Common ci / build gate mistakes in Pyreon and how to fix them."
---

# CI / Build Gate Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### A published `.d.ts` that is invalid or imports an undeclared package degrades to `any` SILENTLY — the default `skipLibCheck: true` hides it from every consumer

(2026-09, `check-declarations`). Three shipped instances, all green in-repo because the workspace resolves everything and nothing compiled the OUTPUT strictly: `s.string().iso.date()` returned `any` (an inferred `{ date: (…) => this }` put polymorphic `this` in an object type literal — TS2526 in a declaration, fine in source); `@pyreon/feature` emitted `import("@tanstack/table-core")`, a package only its dependency declares; and every `@pyreon/elements` props type violated `ComponentFn<P extends Record<string, unknown>>` once instantiated, because an `interface` has no implicit index signature (source passed only because the generic hid it). **Rules: (1) a props/theme bound should be `object`, not `Record<string, unknown>` — the latter rejects every `interface`; (2) give an inferred PUBLIC export a named type when the inference mentions `this` or a transitive package; (3) a declaration-emitting package must declare every package its `.d.ts` imports.** Gate: `bun run check-declarations` (imports declared + every `types` entry compiles with `skipLibCheck: false`). Probe gotcha: on macOS `/tmp` is a symlink — list the files by REAL path or core's global JSX types load twice and report `Duplicate identifier 'Element'`.

---

### A publish-time manifest rewrite that the distribution gate never models

`scripts/publish.ts` strips the `bun` export condition and drops `src` from `files` before `npm publish`, on the premise that nothing reaches `src/` after the strip. That premise is false for `@pyreon/native-runtime-kotlin` and `@pyreon/native-router-kotlin`: they have no JS, and Gradle reads `node_modules/…/src/main/kotlin` by path, so the tarball shipped only `package.json` + README + LICENSE. The Swift twins escaped only because SwiftPM names the directory `Sources`.
  - Decide per package with a positive check (`packageBuildsToLib`: does a surviving `main`/`module`/`exports`/`bin` target point into `lib/`?), not a list of directory names.
  - A distribution gate must check what publish ships, not the workspace manifest. `check-distribution` now applies the publisher's own transform (`orphanedByPublishStrip`, sharing functions with `publish.ts`) and fails when a needed path is dropped.
  - Reference: `scripts/strip-bun-condition.ts`, `scripts/check-distribution.ts`; test `packages/internals/test-utils/src/tests/publish-manifest.test.ts`.

---

### npm's 404-on-PUT means two things; do not route it to the lenient one

Npm answers a refused publish with `404 Not Found - PUT … could not be found or you do not have permission` both for a never-published package (first publish needs a classic token plus Trusted Publisher setup) and for an existing package this workflow may not publish to. Treating both as `needsBootstrap` (warn, skip, exit 0) let a native package stay a version behind with a green release.
  - Disambiguate with an independent observation: `npm view <name> version` says whether the package exists at all. 404-on-PUT for an existing package is `failed`. A lookup that cannot answer keeps the lenient route. Pure helper: `classifyPublishFailure(stderr, existsOnNpm)` in `scripts/publish-classify.ts`.
  - A scaffolder pins `^<own version>`, never `latest`: `latest` resolves each dep independently and silently mixes versions after a partial release. See `packages/zero/create-multiplatform/src/own-version.ts`.

---

### A compile-verdict cache must cache rejections too

A compiler verdict is a pure function of the key, whether it accepts or rejects. Only a process that never answered must not be cached. Decide that structurally from the thrown error — `status` not a number, a `signal`, or a string `code` (`isTransientProcessFailure`) — never from diagnostic text. Not caching rejections made the roughly half of the native suite that asserts "does NOT compile" run cold on every PR until the cell hit its time cap. Route every validator's catch through that one helper. A cell that suddenly runs 25 minutes with the cache restored is a key miss: diff `validate-cache.ts`, the stubs, and any runtime source the stubs concatenate. Reference: `packages/native/compiler/src/validate-cache.ts`; test `tests/validate-cache.test.ts`.

---

### One cache artifact, one key prefix, one writer

`~/.bun/install/cache` was saved under two prefixes by different workflows, doubling ~1 GB entries in the 10 GB actions-cache budget. LRU eviction then dropped the small valuable entries (bootstrap `lib/`, the native verdict store, Playwright browsers) and main paid ~60 min of cold `kotlinc`/`swiftc`.
  - Other workflows use `actions/cache/restore` under the writer's exact key, never `actions/cache`. Put lineage in the key suffix, not a second prefix.
  - `scripts/check-cache-key-sync.ts` enforces: one `hashFiles()` input set per prefix, one writing prefix per `path:`, every restore-only prefix has a writer, identical path lists at every site touching a prefix (`findPathListMismatches` — an `actions/cache` entry is versioned by its path list, so a differing restore never hits), and no save-only key nothing restores (`findOrphanSaves`). Key identity is the whole key with each `${{ … }}` normalised to `<expr>`; `restore-keys` entries match as prefixes.
  - "Save on main only" is for large stores. Main push runs are often cancelled by newer merges, so a small content-addressed store (the native verdicts) is saved from every run.

---

### Under a runner-slot cap, a seconds-long gate is a step, not a job

The org has 20 concurrent jobs org-wide. Under contention, wall-clock is set by DAG levels and throughput by job count, so each extra job is a queue entry every PR pays for.
  - A quick gate is a step of an existing job in the same tier (lib-free → `Fast Gates`, lib-needing → `Build`). A matrix gets one aggregator. A new job needs a written reason it cannot be a step (different OS, different toolchain lifecycle, a required name that must report independently).
  - Give step-based gates `if: ${{ !cancelled() && steps.setup.outcome == 'success' }}` so one push reports every red gate, not only the first.
  - Folding a gate into a required job changes its check name: drop the old name from both branch-protection authorities (classic and ruleset); never add a new required name, which hangs open PRs on "Expected".
  - `pr-gates.yml` stays separate only because its gates are label-sensitive and `ci.yml` must not trigger on `labeled`. See the job map at the top of `.github/workflows/ci.yml`.

---

### Record a package as built only on positive evidence for that package

The batched `bun run --filter=… build` exit code is one boolean for N packages, and the `lib/` mtime postcondition is blind when CI restores `lib/` newer than `src/` (and returns nothing for packages that emit no `lib/`). `scripts/bootstrap.ts` now tees bun's per-package `<name> build: Exited with code N` lines (`attributeBuildFailures` in `scripts/bootstrap-attribution.ts`); an attributed failure stays dirty, the retry uses its own exit status, and an unattributed non-zero exit records no hash. Wait on the batch's `exit`, not `close`: child builds inherit the pipe, so after a timeout kill an orphan keeps `close` from ever firing. Test: `packages/internals/test-utils/src/tests/bootstrap-attribution.test.ts`.

---

### A gate enforced only by the pre-push hook is not enforced

`Fast Gates` runs `validate-fast --ci-complement`, i.e. every validate-fast gate that no workflow `run:` line invokes (computed from `scripts/gate-wiring.ts`), and `scripts/check-gates-wired.ts` fails if that step disappears. "Wired" means some path CI cannot skip runs it.

---

### Release-script branches that only run under Actions must still be exercised

- A variable referenced outside its loop in a `GITHUB_STEP_SUMMARY` block typechecks as DOM `window.name` and throws only in CI.
  - `scripts/heal-release-chain.ts` must read `failed`/`blocked` from `publish-result.json`; an incomplete publish refuses the GitHub Release (with a `::error::` naming packages) but still tags and dispatches native builds. Its registry retry must catch thrown fetches (DNS, ECONNRESET), not only bad statuses.
  - `scripts/cap-changeset-bumps.ts` caps `major` in the frontmatter only (`capChangesetText`); matching the whole file rewrites prose like `Impact: major` in the published changelog.
  - `git diff --name-only` quotes non-ASCII paths. Use the NUL-delimited reader `scripts/changed-files.ts` (`-z`).

---

### A notifier that tests `result === 'failure'` treats a timeout as green

A job killed by `timeout-minutes` reports `cancelled`. Use `result !== 'success'`, or a timing-out nightly stays silent and can auto-close its own alarm issue.

---

### A `fail-fast: false` publish matrix needs a per-item check

`check-published-state --native` reads the sentinel set from `@pyreon/compiler`'s `optionalDependencies` (all platform binaries), because one lagging target silently falls back to the slow JS transform. `release-native.yml` uses `cancel-in-progress: false`, and its publish job checks out the same ref as the build.

---

### Grant write credentials per job, not per file

File-scope `id-token: write` / `pages: write` reaches every job, including build jobs running third-party actions. Keep `contents: read` at the top and put the credential on the one job that uses it (see `release-native.yml`, `docs.yml`).

---

### A type that exists only in a validation stub

Stubs let the Swift/Kotlin gates run without an SDK, so declaring a type there hides that the real runtime lacks it (`<Audio>` emitted `PyreonAudioPlayer`/`AVFoundationAudioEngine`/`Media3AudioEngine`, which existed only in stubs). Two checks: every owned type a stub declares and an emitter emits must exist in that language's real runtime (paired by language), and a probe must compile against the real SDK with the real runtime sources. A stub narrower than the runtime is the mirror defect: it rejects correct codegen. Tests: `packages/native/compiler/src/tests/{emitted-runtime-types-exist,real-runtime-typecheck}.test.ts`.

---

### A primitive no example uses is compiled by no gate

Device gates build examples, the only configuration without stubs. `scripts/check-native-primitive-coverage.ts` checks that every canonical primitive appears in an example; it derives the list from the package's own exports, not the compiler's `SWIFT_NAMES` map (which omits primitives with dedicated emitters).

---

### A probe that cannot fail; a diagnostic truncated at its tail

Grepping the emit for a signal's name "proves" nothing, because the declaration always contains it. Give every sweep a positive control it must report. Order failure messages by decisiveness, not narrative: runners truncate long messages, so put the deciding field first.

---

### Blank-text `STACK_TRACE_ERROR` is either a dead worker or a timeout

Vitest reports both without assertion text, and attributes a dead worker to whichever spec was running. Discriminate by peak RSS per test file and by duration versus the effective timeout; `check-coverage`'s message names both. A spec whose cost scales with repo size gets an explicit derived timeout with measured durations in a comment (`packages/tools/loom/src/tests/strip-equivalence.test.ts:WHOLE_REPO_SCAN_TIMEOUT_MS`), not the shared 20 s default; CI retries do not help under sustained load.

---

### A command that shells out to `vite build` inherits the caller's `NODE_ENV`

Vite sets `NODE_ENV` only when unset and derives `isProduction` from it, not from `mode`. A shell with `development`, or any test runner (`test`), gets a bundle with every dev branch retained. A command whose only job is the production artifact forces `NODE_ENV=production` and restores the caller's value (including unset) in `finally` (`packages/tools/loom/src/build/static-site.ts`). In tests, do not sanitise the child env — spawn with the hostile `NODE_ENV` and assert the output is production (a dev-only warning string is absent). Test: `packages/tools/loom/src/tests/static-site.test.ts`.

---

### A published bin that relies on `import.meta.main` is a silent no-op

Bundling drops a guarded top-level call from a library entry, and Node defines `import.meta.main` only from v24.2. Dev (`bun src/cli.ts`) and programmatic tests never exercise the shipped bin.
  - Ship a hand-written, unbundled `bin/<name>.js` that imports the entry and calls it explicitly (`packages/tools/lint/bin/pyreon-lint.js`).
  - When the bin is the bundled entry and must not self-run on import, use a cross-runtime check such as `matchesProcessEntry` in `packages/tools/mcp/src/index.ts` (compares the realpath'd `process.argv[1]` URL to `import.meta.url` when `import.meta.main` is undefined).
  - `scripts/check-bin-liveness.ts` (the `Check Bin Liveness` step in CI's `Build` job) spawns every published bin under real Node and requires non-empty `--version`/`--help` output, or a JSON-RPC `initialize` answer for the MCP stdio server.

---

### A decide output gating required checks must fail closed

A skipped required check reports success, so an empty decide output must not skip the heavy jobs.
  - Step level: `CODE=$(bun run scripts/affected.ts --code-changed …) || CODE=true; if [ "$CODE" != "false" ]; then CODE=true; fi`.
  - Job level: `if: ${{ (success() && needs.install.outputs.code == 'true') || (failure() && needs.install.result != 'success') }}` — runs when the decide job crashed, still skips when lint/typecheck failed. Plain `!cancelled() && code != 'false'` force-runs every heavy job on every lint-failing PR.

---

### A required workflow cannot use a trigger-level `paths:` filter or skip on `labeled`

A filtered-out PR creates no check run and branch protection waits on "Expected" forever, so path scoping must be a job-level skip from an always-running decide job. Once `labeled` is a trigger type, each label creates a new run on the same SHA and protection reads the latest; the path-detect arm must run on every action including `labeled`, or adding any label launders a red run into a skipped green one. Reference: `.github/workflows/native-device.yml`.

---

### Doc-input files must still trigger the tests that parse them

`scripts/affected.ts` treats `.agents/**`, `docs/**` and `*.md` as docs-only for the heavy jobs, but `DOC_INPUT_CONSUMERS` / `docInputConsumer` map files like `.agents/rules/anti-patterns.md` and `docs/patterns/**` to `@pyreon/mcp` (and `.agents/rules/browser-packages.json` to `@pyreon/lint`) as an additive leaf seed. It must be additive, not an else-fallback: `docs/patterns/**` is owned by `@pyreon/docs`, so a fallback never reaches mcp — and a test fixture that omits the owner hides that. Two outputs: `code` gates build-only jobs; `affected` (`--has-affected`) gates bootstrap and test/typecheck cells. Test: `packages/internals/test-utils/src/tests/affected.test.ts`.

---

### A path rule that matches a directory name matches its namesakes

`packages/<cat>/<pkg>/native/` also matches `packages/core/compiler/native/` (the napi crate), which ran hours of native lanes for compiler PRs. Check a name-based path rule against `ls -d` of every sibling using the name, keep the classifier in one unit-tested fail-closed script both workflows call (`scripts/native-surface-touched.ts`; test `native-surface-touched.test.ts`), and when you add a cache to a lane, add it to that lane's twins.

---

### A measuring gate must reject an invalid measurement

Under `sideEffects: false`, bundling a pure re-export barrel entry (rolldown's `_chunks` shape) drops the imported bindings and emits an un-importable module of a few hundred bytes, so budgets passed against numbers 50–128× too small. `scripts/check-bundle-budgets.ts:diagnoseMeasurement` uses two detectors, neither sufficient alone:
  - a proof: every export specifier must resolve to a local binding;
  - a scale-free heuristic: bundle bytes versus bytes the entry reaches over static relative imports, floored at 5% (lowest legitimate ratio measured ~0.20). It catches gutted but valid bundles and needs no exemption list for small packages.
  - Repair (re-measure via an `export * from <entry>` wrapper) only on proven breakage; it is wrong for entries with no named exports. `PYREON_BUDGETS_NO_REPAIR=1` exercises the detector with repair off. Test: `check-bundle-budgets-failures.test.ts`.

---

### A budget with less headroom than platform noise gives a verdict per machine

Gzip size differs between macOS and the ubuntu runner by ~1%, so a budget inside that band can be green locally and red in CI. `check-bundle-budgets` checks headroom on every run against `requiredHeadroom` and prints the exact value to raise to. It is a ratchet: a new thin entry fails; existing ones are listed in `_thinHeadroom` in `scripts/bundle-budgets.json` with a reason naming what retires them, warn on every run, and are flagged for removal once they recover.

---

### Keep threshold gates at or below measured reality

A gate red on arrival (`Coverage (Full)`, in `.github/workflows/ci-main.yml`) cannot distinguish a regression and is dead. Ratchet thresholds up as tests land. Per package: exclude a file covered only by a `*.browser.test.*` via `coverageExclude` or targeted `/* v8 ignore */` with a comment naming that test (never a file with no coverage anywhere); write real tests for cheap gaps; otherwise re-baseline explicitly with a `BELOW_FLOOR_EXEMPTIONS` entry in `scripts/check-coverage.ts`. Give every new package explicit thresholds; the category default may differ from what the gate assumes.

---

### `--update` must not silently lower budgets

A stale or partial `lib/` measures small, so an unscoped relock commits budgets below what CI measures. Raises and new entries always apply; lowering requires naming the target (`--update=@pyreon/pkg`). Both `check-bundle-budgets` and `check-import-budgets` (`relockBudgets`) share this rule via `scripts/bundle-budget-policy.ts`. Parse `--update=X` explicitly — `args.includes('--update')` never matches it. Test the wiring, not only the pure helper: `bundle-budget-drop-guard.test.ts`, `import-budget-relock.test.ts`.

---

### A test importing a root script pulls in its Bun-only types

`@pyreon/test-utils` typechecks without `@types/bun`, so importing a gate that uses `Bun.build` or `import.meta.dir` fails typecheck (use standard `import.meta.dirname`). Put shared pure policy in a Bun-free module (`scripts/is-entry.ts`, `scripts/test-paths.ts`, `scripts/bundle-budget-policy.ts`) and give Bun-using scripts a minimal local `declare const Bun` (see `check-import-budgets.ts`, `serve-ssg.ts`). Neither `bun run test` nor `validate-fast` typechecks; only the pre-push hook's affected typecheck catches this.

---

### Aggregate gates must surface failed and empty items

`results.filter(r => !r.failed)` hides the failures a gate exists to catch, and an empty input set looks like a clean pass.
  - Emit `failures: [{ name, error }]` in JSON output, print failures to stderr, and exit non-zero on any failure.
  - An empty scan is a skip with a warning, never a pass: `pyreon doctor` resolves scan roots from the workspace's own globs, marks `meta.emptyScan`, and renders `—` plus fails `--ci` when nothing was measured (`report.measured`).
  - `scripts/check-coverage.ts` must not drop packages whose output it cannot parse, must distinguish `0/0` (nothing instrumented, often `src/index.ts` excluded as a barrel — set `includeIndexInCoverage: true`) from a real 0%, and parses the `Coverage summary` block, which the v8 reporter always prints (the `All files` row is omitted for single-file packages). Test: `check-coverage-parse.test.ts`.

---

### `core.hooksPath` set to git's default location is not a user override

`scripts/install-git-hooks.ts:getDefaultHooksPaths` treats `<git-dir>/hooks` and `<git-common-dir>/hooks` (worktrees) as defaults and installs `.githooks/pre-push`; any other value is a real override (husky, lefthook).

---

### Test script policy as a pure function, not through a subprocess

Export `doThing(cwd): StructuredResult` from the script (no `process.cwd()` inside policy) and let `main()` print. Two reasons:
  1. Captured subprocess output is lost under parallel load (`expected '' to contain 'X'`).
  2. Inside a git hook, `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` override both `cwd` and `git -C`, so a test's `git config` can write to the outer repo.

  Fix: the script's git helper (`runGit` in `scripts/install-git-hooks.ts`) clears every `GIT_*` env var and also uses `-C`; test fixtures pass a cleaned env to their own git calls (`cleanGitEnv` in `install-git-hooks.test.ts`). Keep one smoke test that spawns the binary and asserts only the exit status.

---

### `CODE_SIGNING_ALLOWED=NO` breaks Keychain on simulator apps

An unsigned app carries no entitlements and securityd denies `SecItemAdd`, while local (ad-hoc signed) builds pass. Never pass the flag to `xcodebuild test` for an app using Keychain, app groups or any entitlement-gated service; ad-hoc signing is free. xcodegen's `entitlements:` key alone does not embed entitlements under ad-hoc signing; set `CODE_SIGN_ENTITLEMENTS`. To diagnose, render live state (`write-failed`/`read-failed`) into the failure message. Reference: `.github/workflows/native-device.yml`, `examples/native-router-demo-ios/project.yml`.

---

### A verifier that skips its behaviour half must not print a pass

`verify-kotlin` compiled and then ran the smoke `main()`, but with no `java` on `PATH` it printed the same ✓ after a typecheck only. Print a distinct `⚠ SKIPPED … put a JDK on PATH` marker. A skip message that names another job as the place the check runs must be true (grep that job), and a workflow verifying co-located sources must include them in its path filter. Before trusting a gate, inject a failing assertion and confirm it reds with that message. Reference: `packages/native/runtime-kotlin/scripts/verify-kotlin.ts`, `scripts/check-native-cosource.ts`, `.github/workflows/native-{device,validate}.yml`.

---

### A lint gate whose scan excludes the files a rule is about

`pyreon doctor` lints shipped `src/**` minus tests and configs, so rules about tests (`no-query-selector-cast-in-test`) or package configs (`vitest-config-uses-shared`) could never fire. A rule declares its surface (`RuleMeta.scanTarget: 'source' | 'test' | 'packageConfig'`, `packages/tools/lint/src/types.ts`); the gate runs each extra target as its own pass with only those rules on. `exemptPaths` is honoured centrally in the runner before `rule.create()`, and unknown rule ids in config report a diagnostic with a did-you-mean. Tests: `packages/tools/lint/src/tests/{exempt-paths-central,unknown-config-keys}.test.ts`.

---
