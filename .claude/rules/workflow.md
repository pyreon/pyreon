# Workflow Rules

## Mindset

- Senior framework engineer building the fastest signal-based UI framework
- Optimize for: correctness > performance > DX > AI-friendliness
- "Do it properly, not quickly" — no shortcuts, no hacks
- "Understand before changing" — read code, understand the problem, form a hypothesis, verify, then fix
- "Be honest about quality" — 6/10 truthful > 9/10 inflated
- "Find root causes" — don't patch symptoms
- "When uncertain, say so" — better to ask than to guess wrong
- "Alignment before implementation" — propose approach before coding complex changes
- "One effort at a time" — focused batched progress, not scattered changes

### Senior-engineer bar (applies to every task)

The standing default a great senior engineer would apply — assume this is the bar unless the user explicitly relaxes it for a one-off:

1. **Fundamentally correct over locally correct.** When picking a fix, ask whether the SHAPE of the solution is right at the architecture / API / contract level, not just whether it makes the current symptom go away. A patch that works today but recreates the bug class elsewhere is the wrong shape. Reach for the structural answer (right invariant, right abstraction, right trigger semantic) when one exists. PR #818's `paths-ignore` blacklist vs `paths: ['.changeset/**']` trigger-by-intent is the worked example — both fixed the symptom; only the second was fundamentally correct.
   **Is the reproduced SHAPE the whole CLASS?** This is the question that separates the two. The 2026-07 five-release audit found only two symptom-patches, and *both were authored with visible care* — good comments, real tests, honest changesets. What was missing was this one question. The `@layer` fix handled the single CSS shape in the bug report (leaving `@layer` inside `@media` silently dropping rules, and `@layer a, b;` statements swallowed on **every** browser); the `vnode-array` fix enumerated two *initializer syntaxes* when the bug class was *runtime values* (a `VNode[]` from a prop, a param, a cross-module call — all still `[object Object]`). Both shipped a successor days later that admitted it. Diligence does not catch this; asking "what is the smallest description of every input that breaks?" does. Enumerating shapes is a smell — write the stress matrix across the CONTAINER grammar (group rules, statement forms, anonymous forms; every value SOURCE, not every syntax), and fix at the layer where the class collapses to one rule.

2. **Verify the bug — don't just claim it.** Before fixing, REPRODUCE it (preferably as a regression test). After fixing, prove the fix held with bisect-verify-with-restore (see workflow.md "Bisect-verify regression tests"). "I changed the code and the symptom went away" is not proof — it can be confused with caching, parallel-run flake, or unrelated side effects.

   Verify the *mechanism*, not just the symptom. A confident, correct-sounding bug report can name the wrong cause: `bunx @pyreon/mcp` really did die with `reading 'ESNext'`, but not because typescript was missing (the stated hypothesis) — an uncapped `>=5.0.0` range had started resolving to TypeScript 7, which removed the classic Compiler API. Fixing the stated cause would have shipped nothing. Equally, an "obvious" regression may be an artifact: `[zero:ssg] Skipping SSG` on a stacked PR was a missing stack link, not a product bug.
3. **Test end-to-end against the real shape.** Per `.claude/rules/test-environment-parity.md`: mock-vnode tests must have a parallel real-`h()` test; browser packages need real-Chromium smokes; framework-primitive changes need e2e against examples. The test environment must match the shape that ships to users.
4. **Fix issues you find along the way.** While investigating a reported bug, you will encounter adjacent stale code, broken tests, or other small bugs. Fix them in the same PR (or surface them explicitly as separate PRs you immediately open). Do NOT silently leave them broken because they're "out of scope" — a senior engineer leaves the area cleaner than they found it. The exception is when a fix would balloon the PR's review surface — then open the followup PR immediately, don't add it to a TODO list that gets forgotten.
5. **Disclose unknowns + caveats proactively.** When work is done, lead the summary with what's NOT in the PR + which assumptions you couldn't verify. Don't wait for the user to ask "is this complete?" (see feedback: dont-pretend-done).

## API Design Philosophy

1. **Question the need** — Don't build what isn't needed
2. **Write usage example first** — Before implementation
3. **Study prior art** — React, Solid, Vue, Svelte patterns
4. **One concept per API** — Each function does exactly one thing
5. **Zero-config defaults, full-control escape hatches**
6. **Familiarity as a feature** — API should feel natural to anyone who knows the web platform
7. **Types flow end-to-end** — Inferred, not annotated

## Before Writing Code

- Read existing source files in the area you're changing
- Check CLAUDE.md for documented patterns and conventions
- Check if the pattern exists in another package (don't reinvent)
- For complex changes, outline approach and get alignment first
- **Ask: symptom or cause?** When picking up a catalog item, ask whether the item is fixing a symptom or addressing the underlying cause. "F3: doc note" turned into 3 PRs because the right deliverable was "make the silent footgun impossible to hit" — not "add a doc note." If a tactical fix exists alongside a strategic one, decide which level to operate at and surface the trade-off explicitly. Don't silently expand scope and don't silently leave the cause unfixed.

## Code Changes

- Keep changes minimal — one feature per PR, one concern per file
- Follow naming: `signal()`, `computed()`, `effect()` for reactivity; `onMount`, `onUnmount` for lifecycle; `createX` for factories; `useX` for context hooks
- Export types separately from runtime values
- New APIs need JSDoc with `@example` blocks
- No unused imports, no dead code, no `// TODO` comments
- Error messages prefixed with `[Pyreon]` and include actionable guidance
- `__DEV__` guard all warnings — tree-shaken in production

## Recurring CI failure modes — fix once, prevent forever

A small set of CI gates trips freshly-pushed PRs over and over. Before
every push, run **`bun run validate-fast`** — it executes all of these in
~2-5s. The pre-push hook does this automatically, but `PYREON_SKIP_PRE_PUSH=1`
bypasses bring the trap back. If a gate fails CI, ask "would
`validate-fast` have caught this?" — if yes, that's a workflow failure,
not a gate failure.

| Gate | When it trips | Pre-fix command |
|---|---|---|
| **Changeset** | Source change in a published `@pyreon/*` package without `.changeset/<slug>.md` | Run `bun changeset` BEFORE staging the source change |
| **Native binaries (`@pyreon/compiler-<platform>`) lag the JS packages on npm — consumers silently fall back to the 3.7-8.9x slower JS transform** | The publish succeeded but ONE per-package tag push died on a transient GitHub error (`remote: fatal error in commit_refs`, v0.50.0). changesets/action pushes tags AFTER `npm publish` and sets `outputs.published` AFTER the pushes, so the step failed with outputs UNSET → the umbrella step (`if: outputs.published == 'true'`) silently skipped → no `v<version>` tag → `release-native.yml` (tag-triggered) never fired. Ate v0.46.0, v0.49.0, AND v0.50.0 before being root-caused — the daily `published-state.yml` was red for days (the alarm worked; nobody read it) | `scripts/heal-release-chain.ts` runs on EVERY Release-workflow invocation (`if: always()`), deciding from GROUND TRUTH (npm has the version? origin has the tag? a native run exists? binaries on npm?) — never from a prior step's outputs. It retro-heals past holes (tag at the version-BUMP commit, not HEAD), retries pushes, and dispatches `release-native.yml` explicitly (`actions: write`) when the tag push didn't trigger it (a GITHUB_TOKEN-pushed tag never triggers workflows). **General rule: a step gated on another step's `outputs` is gated on that step's HAPPY PATH — for anything load-bearing, derive the condition from ground truth and make the step `always()` + idempotent** |
| **A workflow step exits 127 (`command not found`) on `push: main` while every PR was green** | A shell function was called ABOVE its definition. Shell has no hoisting, so the call is `command not found` — but `bash -n` passes (the syntax is valid; the failure is ordering) and the repo's other CI gates read YAML structure, not shell semantics. The shape that hides it is an **early-exit branch**: `ci.yml`'s matrix step exits early for non-`pull_request` events, so the push-only path is a code path NO pull request ever runs. Moving `batch()`'s callers into both branches while leaving the definition below the early exit was green on every PR and died on the next push to main (`line 21: batch: command not found`), reddening `Changes (decide)` → `Typecheck`/`Test`/`E2E`/`Scaffold Smoke` for every subsequent run | `bun scripts/check-workflow-shell-order.ts` (in `validate-fast`/pre-push) scans every workflow `run:` block and names the function, its call line, and its definition line. Only TOP-LEVEL calls are ordered — a call from inside another function body runs at invocation time and is correctly ignored. **General rule: when a step has an early-exit branch, the branch past it is untested by PR CI — read it as if it were a separate script** |
| **Check No Major Changesets** | A changeset declares `: major`. Pyreon is 0.x, so a breaking change is `minor` — `cap-changeset-bumps.ts` downgrades it at release time and this gate catches the shape at PR time. Was NOT in validate-fast, so the only feedback was a CI round trip (hit on the TanStack Table v9 PR) | Now in `validate-fast`. Mark the changeset `minor` and call the breaking change out in the PROSE; do not reach for `major` to signal severity |
| **Docs Generated Fresh** (after a manifest OR `anti-patterns.md` edit) | `gen-docs` and `bun docs/scripts/gen-all.ts` are a PAIR — the first regenerates llms/api-reference, the SECOND regenerates the docs-site `reference/`, `troubleshooting/` and examples pages. Running only the first leaves the generated reference describing the old API (the v9 PR left `reference/table.md` documenting the removed `Computed<Table<T>>`). `validate-fast` runs `gen-docs --check` only, so it passes | Run BOTH generators, then commit the regenerated output: `bun run gen-docs && bun docs/scripts/gen-all.ts` |
| **Check Doc Claims** | Adding/removing a docs page, or changing a count CLAUDE.md / README quotes (hook count, lint rule count, doc page count, etc.) | Run `bun run check-doc-claims` after touching `docs/` or any LOCKED count source |
| **Check Bundle Budgets** | Adding a new publishable package, or runtime growth in an existing one | `bun run check-bundle-budgets`; if growth is intentional, `bun run check-bundle-budgets --update` and review the diff |
| **Check Import Budgets** | A change made a canonical minimal import (`mount`-only, `signal/computed/effect`, basic router) bigger — usually an optional feature that stopped tree-shaking | `bun run check-import-budgets`; investigate WHY the minimal import grew (an eager import / lost `/*#__PURE__*/` / `sideEffects` regression) BEFORE relocking with `--update` |
| **Check Distribution** | New published package, or `package.json` `files` edit that drops `lib/**/*.map` | `bun run check-distribution` |
| **Check Release Readiness** | New published package missing `publishConfig.access: "public"` or absent from `.changeset/config.json` `fixed[0]` | `bun run check-release-readiness` |
| **Check Manifest Depth** | LOCKED package (`store`/`rx`/`query`/`form`) manifest density dropped | `bun run check-manifest-depth` |
| **Check Manifest Examples** | A `manifest.ts` `api[].example`/`longExample` (or a shipped signature it calls) changed so the example no longer typechecks against the LIVE package export — wrong arg order/shape, a missing/renamed export, a wrong return-shape field. These examples render VERBATIM into the MCP api-reference AI assistants read, so drift there teaches broken code | `bun run check-manifest-examples` — the failure names the package + api entry + TS error. Fix the example/signature to match the SHIPPED export (shipped runtime is source of truth). If the finding is a harness limitation (untyped example data → `unknown`, a DOM-global name collision, an alt-JSX namespace), add the package to `NON_ENFORCED` in `scripts/check-manifest-examples.ts` with a one-line rationale (ratchet — the list can only shrink) |
| **Lint Ratchet** | A change pushed an oxlint `warn`-rule count above its `lint-baseline.json` count | `bunx oxlint .` to see the new finding → fix it (or scope/suppress with rationale). If you legitimately REDUCED counts, `bun run check-lint-ratchet -- --update` to tighten the baseline. NEVER raise a count to absorb a new finding |
| **Lint Ratchet** (pyreon-lint half) | A change pushed an `@pyreon/lint` advisory-rule count over framework `src` above its `pyreon-lint-baseline.json` count | `bun run lint:pyreon` to see the new finding → fix it, OR (if the rule doesn't apply to that framework package — e.g. `no-raw-addeventlistener` in `@pyreon/hooks`) scope it off in `.pyreonlintrc.json` with rationale. If you legitimately REDUCED counts, `bun run check-pyreon-lint-ratchet -- --update` to tighten. NEVER raise a count to absorb a new finding |
| **Diagnose Catalog** | Source change in `packages/core/{runtime-dom,runtime-server,core,compiler,router}/src/` without an `ERROR_PATTERNS` entry | Add entry to `packages/core/compiler/src/react-intercept.ts:ERROR_PATTERNS` OR add `skip-diagnose-catalog` label if genuinely catalog-irrelevant |
| **Release Build / Check Export Entries** | A published package's `exports` subpath `"./X"` doesn't have the `src/X.{ts,tsx}` entry the build tool derives from the KEY (e.g. `"./matchers"` but the file is `src/matchers-register.ts`). Builds fine on INCREMENTAL/cached CI, fails the release's CLEAN `build-batched` with `UNRESOLVED_ENTRY`, aborting the publish of EVERY package. | `bun run check-export-entries` (in `validate-fast`/pre-push) catches it in <1s; the `Release Build` CI job runs the literal `build-batched` + `publish.ts --dry-run` so the release build/pack can't fail. Fix: rename the file to `src/X.ts` OR change the export key to match — the tool derives entries from the KEY, not the bun/import/types target |
| **check-multiplatform-tier** | A new/edited manifest lacks the `multiplatform` tier declaration, a published package has neither manifest nor exemption, or a tier changed without regenerating the docs table | `bun run check-multiplatform-tier` (in `validate-fast`/pre-push). Fix: declare `multiplatform: { tier, rationale }` in the manifest (rationale REQUIRED for `web-only`), or add a genuinely API-less package to `NO_MANIFEST_EXEMPT` with the others; table drift → `bun scripts/check-multiplatform-tier.ts --write-table` |
| **Multiplatform Matrix (headline == table sum)** | An edit to a row of the capability matrix in `docs/src/content/docs/multiplatform.md` without recomputing the headline — the drift mode that let the page carry THREE disagreeing self-ratings at once (66/100 status, ≈72% headline, a table summing to 73%) | `bun scripts/check-multiplatform-matrix.ts` (in `validate-fast`/pre-push + the CI Fast Gates job). Fix: edit the TABLE, run the gate, and paste the exact headline it prints (`**≈ N%** (E.d / T`). Never hand-edit the headline to a number the table does not produce |
| **check-tsconfig-presets** | A new package/example copied a neighbour's PRE-consolidation tsconfig (inline outDir/jsx/types instead of extending an `@pyreon/tsconfig` preset) | `bun scripts/check-tsconfig-presets.ts` (in `validate-fast`/pre-push). Fix: add the `"@pyreon/tsconfig": "workspace:*"` devDep + `{ "extends": "@pyreon/tsconfig/lib[-jsx].json" }` (examples: `example.json`) + keep only genuine per-package overrides; deliberate opt-outs go in the script's `EXEMPT` with a rationale |
| **Docs Sync (gen-docs)** | Edited a `manifest.ts` without running `bun run gen-docs` to regenerate llms / api-reference | `bun run gen-docs && bun run gen-docs --check` |
| **Bundle size diff / perf / leak-sweep — red on a PR-comment failure** | An ADVISORY workflow turned its check RED because the GitHub API 5xx'd while POSTING the comment — the measurement had already succeeded (a bare `503` on `issues.listComments` blocked release PR #2355 on 2026-07-16). An advisory workflow whose failure mode blocks the PR is a design defect, not bad luck | Nothing to fix on the PR — re-run the check. The class is gated by `check-advisory-comment-steps` (in `validate-fast`): every comment-posting github-script step needs `retries:` + a `catch` calling `core.warning`. A step whose post IS the deliverable (a notifier) goes in `NOTIFIER_WORKFLOWS` with a rationale and stays LOUD |
| **A stacked PR looks green with only a handful of checks** | Until 2026-07 eight workflows — `ci.yml` included — were gated `pull_request: branches: [main]`, so a PR based on a FEATURE branch ran none of them: no typecheck, no test cells, no lint, no gates. What showed was the 4-6 checks from the workflows that run on any base (`native-device`, `native-validate`, `docs`, …), all green, which reads as validated. Observed on #2526/#2527: 7 checks vs 66 on the main-targeted parent | Fixed by removing the `branches` filter from every `pull_request` trigger (`push: branches: [main]` is unchanged). If you see a PR with far fewer checks than its siblings, compare `gh pr view <N> --json statusCheckRollup` counts before trusting the green. NOTE the second half is NOT fixed: branch protection applies to `main` only, so checks on a PR into a feature branch still are not REQUIRED — they now RUN and are visible, which is what makes an unreviewed merge a choice rather than an accident |
| **Scaffold Smoke (monorepo-vercel)** | Workspace version ahead of npm (release in flight) | Auto-skipped by `shouldSkipIsolatedCell`; if it still fails, the npm-version check failed or your branch is named `changeset-release/*` |
| **Test (tools) — mcp `token-budget.test.ts` density caps** | Your new `anti-patterns.md` entry's index line is too DENSE (avg tokens/entry ≥ 55 or one line ≥ 100 tokens) — the budget is entry-count-relative, so a normally-dense new entry can never trip it; only verbosity does | Tighten the entry's TITLE + hook to catalog density (the index line is `- **title** [detector] — hook`). Do NOT raise the caps. If the 12,000-token design-boundary tripwire fires instead, the index has outgrown single-response form — paginate `get_anti_patterns`, don't bump |
| **Docs Sync / Docs Generated Fresh (concurrent-merge staleness)** | Your PR's generated docs were fresh when ITS CI ran, but ANOTHER PR touching generator inputs (`anti-patterns.md`, a `manifest.ts`, docs examples) merged after — branch protection is non-strict, so checks don't re-run on base movement; the LAST merger lands stale generated output on main | On a blocked PR: rebase onto `origin/main` + `bun run gen-docs && bun docs/scripts/gen-all.ts`, commit the regen. On main: the **Docs Freshness Guard** workflow (`docs-freshness-guard.yml`) detects drift on every main push and auto-opens an `auto/docs-regen` fix PR — merge it (self-healing; a red guard run = main is stale right now) |

| **`Build` / `Verify Modes` / `E2E` / `e2e (native-*-web)` all red at once after a SHARED-SOURCE change** | A tri-target example source (`examples/native-*-ios/src/App.tsx`) is compiled by PMTC for the two NATIVE targets — which never read `node_modules` — and BUNDLED by the web sibling, which does. Add a primitive to the shared source, prove it on a simulator and an emulator, and the web build cannot resolve the import: one missing dep reds four checks, ~50 minutes in, reported as a blank page rather than a missing dependency. Proving a change on two of three targets is not proving the change | `bun run check-shared-source-deps` (in `validate-fast`/pre-push) names the package and the exact fix line. Then add it to the WEB example's `package.json`, `bun install`, commit `bun.lock`. The runtime half (a component that resolves but renders differently on web) is still only caught by the web e2e — run `bun run test:e2e:native-router-demo-web` when the change touches rendering |
| **`iOS — xcodebuild` red on a Keychain-touching test that passes locally** | The workflow step ran `xcodebuild test … CODE_SIGNING_ALLOWED=NO`. An UNSIGNED simulator app carries no signature entitlements and securityd DENIES `SecItemAdd`, so any Keychain use fails ONLY in CI — locally `xcodebuild test` ad-hoc signs by default and passes. This was fixed once on ONE step, leaving four others carrying the flag, latent until a session-rehydration test landed in the finance app. There is a second half: dropping the flag is necessary but NOT sufficient — xcodegen's `entitlements:` key alone does not embed an entitlements blob under ad-hoc signing, only the explicit `CODE_SIGN_ENTITLEMENTS` build setting does | `bun run check-ios-signing-policy` (in `validate-fast`/pre-push) enforces BOTH halves: no `CODE_SIGNING_ALLOWED=NO` on any `xcodebuild test` (it stays legal on `xcodebuild build`, which never launches the app), and every `native-*-ios` example sets `CODE_SIGN_ENTITLEMENTS` — uniformly, whether or not its current tests touch the Keychain. Reproduce locally by passing the flag yourself: it fails unsigned and passes signed |
| **PR targets main** | The PR's base is another feature branch (a stack). Nothing gates a merge into an unprotected base, so the PR is squashable before any check finishes | `gh pr edit <N> --base main`. Dependent work: branch from the parent, PR against `main`; the diff shrinks when the parent merges |
| **Diagnose Catalog (after a `diagnose.ts` edit)** | You REWORDED an `ERROR_PATTERNS` entry instead of adding one — the gate compares COUNTS (`base=35 → head=35` fails). Separately, a new entry whose regex/prose contains the literal token `createSourceFile` / `SyntaxKind` / `createLanguageService` trips `diagnose.test.ts`'s browser-bundle marker check (a proxy for "typescript isn't bundled" that cannot tell prose from a bundled symbol) | When a fix REMOVES an error, teach the RESIDUAL footgun it leaves behind rather than reaching for `skip-diagnose-catalog`. Name removed TS members via `ScriptTarget`/`ScriptKind`/`ESNext` (not grepped). Comments are stripped by the bundler; STRING LITERALS are not. **No gate re-runs the compiler suite after a diagnose edit** — run `bun run --filter='@pyreon/compiler' test` explicitly (same class as the manifest-edit trap) |
| **`typecheck (<category>)` — `TS2307 Cannot find module '@pyreon/x/subpath'`** | A `bun.lock` reset swept a needed dependency edge out of your commit. `git checkout <ref> -- bun.lock` **STAGES** the change, and a later `git commit -F msg` commits everything already staged — silently reverting a devDep edge a parent commit added. CI installs with `--frozen-lockfile`, so the workspace symlink never exists. It hides locally because an earlier non-frozen install already linked the package (typecheck passes with AND without `lib/`) | The honest check is `git diff <parent-branch> -- bun.lock` = **0 lines**, NOT "reverted to main". After any lock reset: `git diff --cached --name-only \| grep bun.lock` → `git restore --staged bun.lock` if unintended. The lock's dep string must MIRROR package.json exactly (`workspace:*` ≠ `workspace:^` — frozen-lockfile rejects it) |
| **A stacked PR goes red with a DUPLICATED hunk (`invalid redeclaration`, doubled block) right after its parent merges** | The parent's changes are now on `main` AND still present as the child's own commit. GitHub builds a MERGE REF (`base + head`), so git's 3-way merge sees the same hunk added on both sides with slightly different context and applies it TWICE. **Every local check passes** — the branch's source files are correct; only the merge ref is wrong, so this reproduces nowhere locally. (2026-07: #2510 merged while #2514/#2520 were stacked on it; the Swift stub's `UIDevice` block appeared twice → `invalid redeclaration of 'UIDevice'` + `ambiguous use of 'init()'` → 53 failures across every `validateSwiftWithStubs` test.) | Diagnose by inspecting what CI actually builds, NOT your branch: `git fetch origin refs/pull/<N>/merge:refs/remotes/pr<N>m` then `git show pr<N>m:<file>`. Fix = rebase onto post-merge main so the child stops carrying the parent's commit: `git rebase --onto origin/main <old-parent-tip> <branch>`, then re-verify the MERGE REF (not just the branch) has one copy. Watch for a bare `git stash pop` during the restack — the stash is repo-global and can pop ANOTHER session's entry |
| **A stacked PR's own new test fails, looking like a product regression** | The PR's tests assert a PARENT PR's behavior, but the branch was cut from `main` and does not CONTAIN the parent's commits. (2026-07: #2158's smoke asserted #2155's build layout; on main's old layout the build skipped SSG, and the symptom read as `[zero:ssg] Skipping SSG …` — a product bug, not a stacking gap) | Check FIRST: `git merge-base --is-ancestor <parent-tip> <child-branch>`. Then `git rebase origin/<parent-branch>`, verify the previously-red cell passes locally, force-push, and state the merge order in a PR comment. Restacking a 3-deep chain: `git rebase --onto <new-parent> <old-parent-tip>` (beware the lock trap above) |
| **`Coverage (Full)` — red, and not caused by your PR** | It runs on `push:main` + `merge_group` ONLY (PRs see the fast `Coverage` floor check), so it can rot unnoticed. In 2026-07 it had been failing on **every** completed main run, across 15 packages: a safety-net gate that is red-on-arrival cannot distinguish a regression from the baseline — it is a dead gate | Fixing the gate IS the work; never re-run past it. Triage PER PACKAGE in three honest categories: **(a)** accounting artifact — a file at ~0% in the node run because only a real-Chromium `*.browser.test.tsx` covers it → add to `coverageExclude` with a rationale comment (never exclude a file with no coverage anywhere); **(b)** cheap real gap → write the genuine test; **(c)** honest re-baseline → lower the threshold to the MEASURED actual with a `check-coverage.ts` exemption entry (the drift check requires table ⇄ config to match exactly), and ratchet back up like `lint-baseline.json`. Never lower thresholds in bulk. **It rotted AGAIN by 2026-08 — same shape, seven packages** (six drifted under the multiplatform wave: charts/code/rich-text via their new `/webview` subpaths, hooks via the native hooks, feature, loom; plus `@pyreon/config` reporting a bogus `0%`). Recurring in under a month says the once-per-main cadence is the root cause, not the individual drift: nothing measures coverage at PR time, so every PR is free to drop it and only main goes red — where a red gate blocks nobody. **Before triaging, re-read the gate's OUTPUT critically**: its progress lines were interleaved by 4-way concurrency (a newline-less `write` then a later `log`), so one package's percentage printed beside another package's name — `@pyreon/atlas`'s 79.72% appeared next to `@pyreon/zero`, which reads as a real finding about the wrong package. The TABLE is authoritative, the progress lines were not (fixed to one atomic line per package) |

| **`E2E` aggregator red with an EMPTY e2e matrix (`e2e-suite=skipped`, `has=true`)** | The two affected-deciders DISAGREED on a change shape: `e2e-affected.ts` treats ANY `scripts/**` change as unknown-blast-radius → run ALL suites, but `affected.ts`'s `isScriptFile` classified only code extensions — so a `scripts/*.json`-only PR (import-budgets.json, bundle-budgets.json) computed `affected=∅` → Bootstrap skipped → the e2e matrix (`needs: bootstrap`) skipped → the fail-closed aggregator errored on the decide-says-run/suite-skipped contradiction. The PR was structurally un-mergeable (found via #2321) | Fixed: `isScriptFile` now includes `.json` (bisect-locked in `affected.test.ts`). General rule: any pair of deciders that gate the SAME downstream job (affected.ts ⇄ e2e-affected.ts) must classify every shared path shape identically — when adding a shape to one, grep the other; the fail-closed aggregator turns a disagreement into a hard red, which is correct (it surfaced this) but means the fix is in the CLASSIFIERS, never in loosening the aggregator |

**CI wall-clock here is QUEUE-dominated, so job COUNT is the lever — not job speed.** Measured on run 31023199747 (a normal PR): 1,732 min of summed queue wait against 87 min of summed work, a **19.8x tax**, with the median cell waiting 30.6 min for a slot it used for under a minute. A matrix cell is not free — before running anything it pays a queue wait plus checkout, `setup-pyreon` and (for e2e) a Playwright install: measured 35-52s, against suites that RUN for 8-30s. `e2e (cssvars)` spent 35s of setup on 8s of testing. Splitting a job into N only buys wall-clock while runners are FREE; under contention the cells serialise through the queue anyway, so the split costs N setups and N queue entries for the same work — and because the runner pool is shared, a wide fan-out slows every OTHER branch too. Hence `scripts/ci-batch.ts`: pack cells into a bounded number of batches (LPT, so the slow tail gets its own runner), which took the fan-out from 44 cells to 12. When adding a matrix cell, ask whether it needs its own RUNNER or just its own step — the default answer is a step. Cells that must stay 1:1 (the `native-*` test cells key a verdict cache on their own category) go in the `--isolate` list.

**Two of the entries above share one root cause worth naming on its own: a fix applied to ONE call site is folklore, not a fix.** The Keychain/signing problem was solved correctly on the router-demo step, with a good comment — and four other steps kept the broken flag until a new test happened to touch them. The lesson is not "be more careful": it is that a correction which cannot be stated as a repo-wide invariant, and enforced as one, will be re-discovered by whoever writes the next test. When you fix a CI trap, ask what invariant it implies, apply it everywhere the invariant holds, and gate it — otherwise the second instance is already written and just has not run yet.

When CI fails on a gate not in this list, ADD IT here in the same PR.
The list is the institutional memory; missing entries mean the trap
will repeat.

**Gate health is itself a deliverable.** A gate that is permanently red,
permanently flaky, or structurally unable to fail is worse than no gate — it
trains everyone to ignore it while advertising protection that does not exist.
Discovering one IS a finding: fix the gate in its own PR and say so plainly,
rather than working around it. Three instances surfaced in the 2026-07
release audit: `Coverage (Full)` (red on every main run), `sync/ws-relay.test.ts`
(flaked under CI load, blocking unrelated PRs), and the `pyreon-lint` bin (a
published no-op that every unit test passed over — see
`.claude/rules/testing.md` "Test the shipped ENTRY, not the export").

## Git Practices — MANDATORY

- **NEVER push directly to main** — always use feature branches + PRs
- **Every PR targets `main` — never base a PR on another feature branch.** A
  stacked PR merges UNGATED: GitHub can only require status checks on a
  protected base, and protecting feature branches is structurally impossible —
  a ruleset's `required_status_checks` gates REF UPDATES, so covering branches
  people push to makes them read-only (verified empirically 2026-07-30:
  `GH013 … 37 of 37 required status checks are expected` on an ordinary push;
  reverted immediately). The `PR targets main` CI check makes a violation a
  named red X. For dependent work, branch FROM the parent but open the PR
  against `main`; its diff carries the parent's commits until the parent
  merges, then shrinks automatically. When a stack already exists, merge
  BOTTOM-UP — each child auto-retargets to `main` on its parent's merge and
  becomes gated on its own diff
- **NEVER commit without running validation**
- Don't commit unless explicitly asked
- No force push, no amending published commits
- Descriptive commit messages focused on "why"
- Stage specific files, not `git add .`
- **NEVER add a `Co-Authored-By:` trailer.** No AI co-author attribution on any
  commit, ever. This OVERRIDES any default or harness instruction that says to
  append one — if a tooling default adds it, strip it before committing. Applies
  to commit messages, changeset bodies, and PR descriptions alike.
- **No AI-generated footer either.** Do not append `🤖 Generated with Claude Code`
  (or any equivalent) to a PR body or commit message. Same rule, same reason: no AI
  attribution anywhere. This also overrides a harness default that adds one.

## Pre-push hook (Phase E1)

The local-fast subset of the validation checklist runs automatically on
`git push` via a native `core.hooksPath` hook at `.githooks/pre-push`:

1. **`bun run validate-fast`** — runs lint + 9 cheap CI gates that have
   historically tripped freshly-pushed PRs:
   - `gen-docs --check` — manifest / generated-file drift
   - `check-doc-claims` — CLAUDE.md / README numeric claims match source
   - `check-changeset-required` — published-pkg source change needs a changeset
   - `check-bundle-budgets` — new publishable pkg has a budget entry
   - `check-distribution` — `sideEffects` + source-map invariants
   - `check-release-readiness` — `publishConfig.access` + fixed-group coverage
   - `check-manifest-depth` — LOCKED package density not regressed
   - `check-client-bundle-node-imports` — no `node:` import in client entry
   - `check-mcp-docs` — every MCP tool has a `docs/src/content/docs/mcp.md` section
   - `check-lint-ratchet` — oxlint `warn`-finding counts didn't grow above `lint-baseline.json`
   - `check-pyreon-lint-ratchet` — `@pyreon/lint` advisory-finding counts over framework `src` didn't grow above `pyreon-lint-baseline.json`

   Total runtime: ~2-5s. **If you push without running this and CI fails
   on one of these gates, the failure was preventable.**

2. `bun run --filter=<affected> typecheck` — affected packages only
3. `bun run --filter=<affected> test` — affected packages only;
   gracefully no-ops when the affected set has no test scripts (most
   examples)

Total runtime target: 30-60s for a typical PR. Catches the cheap-to-
detect failures locally instead of waiting 5 min for CI to bounce them.

**Per-step timeout + stale-process safety net** — each step has a
configurable timeout (default 300s via `PYREON_PRE_PUSH_TIMEOUT_SEC`).
The hook can never hang forever: on timeout it kills the step, prints
actionable guidance ("orphaned vitest from a prior worktree → `pkill -f
'vitest run'` and retry"), and exits 1. Companion startup check warns
about long-running vitest processes (>10 min old) belonging to other
worktrees — they don't get auto-killed (might be intentional `vitest
--watch` elsewhere) but flagged so the user can decide.

**The 300s default is NOT enough for a workflow-file edit in a fresh
worktree, and the failure reads like a broken test.** `.github/workflows/**`
is classified a ROOT file by `scripts/affected.ts:isRootFile`, so touching
any workflow escalates the affected set to `--filter=*` — the hook then runs
the whole suite, including `@pyreon/native-compiler`, whose validate
verdicts are content-addressed and therefore COLD in a worktree that has
never run them (`.claude/rules/testing.md`: ~397s uncached vs 6s warm). The
step blows the 300s budget and is killed, and the only line you see is
`@pyreon/native-compiler test: Signaled with code SIGKILL` — which looks
exactly like a crashed test rather than a wall-clock kill. Fix:
`PYREON_PRE_PUSH_TIMEOUT_SEC=1800 git push`. Do NOT reach for
`PYREON_SKIP_PRE_PUSH=1` — a root-file change is precisely when the full
run is worth having, and the second run is far faster because the first one
warmed part of the verdict cache before it was killed.

**Empty-affected case** — when there are no committed changes vs
`origin/main` (e.g. pushing the same commit, freshly-rebased branch
that resolved to no diff), the hook **skips typecheck + tests** and
exits 0. Earlier the empty case fell back to `--filter='*'` which ran
the full 60+-package suite for what was supposed to be a no-op push —
needlessly heavy and prone to parallel-run flakes.

**Bypass:**

- `PYREON_SKIP_PRE_PUSH=1 git push` — env-var bypass for one-off
  pushes (clearly named so it can't be mistaken for a permanent flag).
- `PYREON_PRE_PUSH_TIMEOUT_SEC=600 git push` — extend the per-step
  timeout (e.g. when running on a slow machine with full filter).
- `git push --no-verify` — git's native bypass.
- `git config --unset core.hooksPath` — disable repo-wide, keeps the
  hook script committed for whoever does want it.

**Re-enable after disabling:** `bun scripts/install-git-hooks.ts`.

**Why `core.hooksPath` instead of husky:** no new dev dependency, hook
is version-controlled (`.githooks/pre-push`), idempotent install,
respects an existing user-set hooksPath (won't clobber husky/lefthook
in a clone where someone has them wired up).

## Validation Checklist — Before EVERY Push

1. `bun run lint` — zero errors. Also run `bun run lint:pyreon` (Pyreon's OWN rules over first-party `packages/*/src` via `pyreon doctor --only lint --ci`) — this is the `Pyreon Lint Gate` CI check; zero errors.
2. `bun run typecheck` — zero errors (MCP pre-existing TS2589 is known)
3. `bun run test` — all tests pass
4. `bun run gen-docs --check` — no manifest/api-reference drift (catches the "I edited the generated file directly" mistake)
5. `bun run verify-modes` — every example × mode cell still produces correctly-rendered output (catches "typed-but-unimplemented" at the build-artifact level)
6. If you changed `ZeroConfig`, router types, or any public config-shaped surface: `bun run audit-types --all` — verify your new fields aren't typed-but-unimplemented at the type-surface level (zero non-type refs = bug)
7. If you changed runtime code in any package's `src/` (especially anything that might add bundle weight): `bun run check-bundle-budgets` — asserts each package's gzipped main-entry size stays within the budget locked in `scripts/bundle-budgets.json`. Lazy-loaded dynamic-import chunks are excluded by design. If growth is intentional, run `bun run check-bundle-budgets --update` and review the diff.
8. If you added or modified a published package's `package.json`: `bun run check-distribution` — asserts every published `@pyreon/*` package declares `sideEffects` AND does NOT exclude `!lib/**/*.map` from `files`. Source maps are shipped so framework stack traces are readable for users (every major JS library does this — React, Vue, Solid, Preact, Svelte, TanStack). Includes a live `npm pack --dry-run` probe asserting `.map` files are present in the tarball.
9. If you added/removed a hook in `@pyreon/hooks` or a `.md` file in `docs/`: `bun run check-doc-claims` — asserts the hook count and doc-page count claims in README/manifest/CLAUDE.md/docs index stay in sync with the actual source. Catches the drift where one claim site gets bumped and others don't.
10. If you edited a package `manifest.ts` `api[]` that is LOCKED in `scripts/check-manifest-depth.ts` (store, rx, query, form): `bun run check-manifest-depth` — ratchet asserting a migrated package's MCP `get_api` density (entry count + entries-with-`mistakes[]`) never erodes below its recorded floor. When migrating a NEW package to density, add it to `LOCKED` with the numbers that PR achieves (counted via `findManifests`, not a grep).
11. If you changed runtime behavior of signals / mount / router / fs-router: `bun run test:e2e` — exercise primitives in real Chromium (~90s, requires Playwright Chromium via `bunx playwright install chromium`)
12. If you changed docs OR a public API surface that docs reference: `bun scripts/check-doc-examples.ts` — typechecks `docs/src/content/docs/**/*.md` code blocks marked with `// @check` as the first content line. Opt-in by design (1930+ blocks total; many are illustrative partials); the gate covers what's marked and grows as authors add markers to new authoritative examples.
13. If you changed source code (`.ts` / `.tsx`) under `packages/core/{runtime-dom,runtime-server,core,compiler,router}/src/` AND the bug fix could surface as a user-visible error: add an entry to `ERROR_PATTERNS` in `packages/core/compiler/src/react-intercept.ts` so `pyreon doctor diagnose` / MCP `diagnose` can teach the fix. CI enforces this via `Diagnose Catalog`; the `skip-diagnose-catalog` label bypasses for genuinely catalog-irrelevant changes (perf-only / type-tightening / internal refactor). The gate's detector matches only real source files — `package.json` / `CHANGELOG.md` / `README.md` / `tsconfig.json` / test files (`*.test.ts(x)`, `*.spec.ts(x)`, files under `src/tests/` or `src/__tests__/`) and Storybook stories never fire the gate. See `scripts/check-diagnose-catalog.ts:isSensitiveSourceFile` for the predicate + `packages/internals/test-utils/src/tests/check-diagnose-catalog.test.ts` for the contract. The release-PR auto-skip (`changeset-release/*` branch prefix) is preserved.
14. If you changed source files in a PUBLISHED `@pyreon/*` package (i.e. a package whose `package.json` does NOT set `"private": true` AND is NOT in `.changeset/config.json` `ignore`): add a changeset via `bun changeset`. CI enforces this via the `Changeset` gate. The `skip-changeset` label bypasses for the rare case where a published-package source file changed but the change is genuinely catalog-irrelevant (comment-only edit, type-tightening with no runtime impact). The gate's detector intentionally excludes PRIVATE packages (`@pyreon/test-utils`, `@pyreon/manifest`, `@pyreon/perf-harness`, `@pyreon/vitest-config`, `@pyreon/playwright-config`, `@pyreon/devtools`, `@pyreon/ui-*` — **NOT** `@pyreon/native-*`, which this line used to claim: all six native packages are published now, the code excludes only `"private": true`, and there is no name-based rule), changeset-`ignore`d workspaces (examples, docs, ai-reference), AND test/spec/story files (`*.test.ts(x)`, `*.spec.ts(x)`, `*.stories.ts(x)`, anything under `tests/` / `__tests__/`) even inside a published package's `src/` — `scripts/publish.ts` strips `src/` from the published tarball entirely (`stripSrcFromFiles`), so test code never reaches consumers at all. Test-path classification is shared with the `check-diagnose-catalog` gate through ONE source of truth, `scripts/test-paths.ts` (`isTestPath`) — both gates import it, so the definition can't drift. So a test-only PR in a published package no longer needs a changeset OR the `skip-changeset` label. See `scripts/check-changeset-required.ts:isConsumerAffectingFile` + `scripts/test-paths.ts` for the classifier + `packages/internals/test-utils/src/tests/{check-changeset-required,test-paths}.test.ts` for the contract.
15. If API surface changed: update CLAUDE.md, docs/, README, llms.txt, llms-full.txt, MCP api-reference (via the manifest, not the generated file)
16. **NEVER merge PRs.** Open PRs and stop. Report the URL. The user merges every PR themselves. Never run `gh pr merge` (with or without `--auto`) unless the user explicitly says "merge it" for that specific PR. Authorization to merge does not generalize to follow-up PRs.

Steps 1-4 are local-fast (~10s combined). Steps 6-10 (audit-types, check-bundle-budgets, check-distribution, check-doc-claims, check-manifest-depth) take ~5-15s. Steps 5 and 11 (verify-modes, test:e2e) take ~90s each — run before push, not after every commit. All run in CI as required checks; running them locally just shortens the feedback loop from "CI fails 5min after push" to "blocked locally, fix in 10s."

## Bisect-verify regression tests — MANDATORY for fix PRs

When a PR adds a regression test for a bug it fixes, the test must be bisect-verified before the PR is ready:

1. Save the fix.
2. Revert the fix (temporary).
3. Run the test — assert it fails with the right error message.
4. Restore the fix.
5. Run the test — assert it passes.

If step 3 doesn't fail, the test passes for the wrong reason and provides false confidence. PR #200's first regression test passed even with the broken pattern, because esbuild's minifier folds dead code regardless of the gate. The bisect verification caught it.

Document the bisect result in the PR description: "Bisect-verified: reverted fix to broken state, test failed with `<error>`, restored, test passed." Without this line, the regression test is not load-bearing.

## Before Considering Work Complete — MANDATORY

1. All validation steps pass (lint, typecheck, test)
2. Exports updated in `src/index.ts`
3. **Every package MUST have** `LICENSE` (MIT) and `README.md` — no exceptions
4. **All documentation surfaces updated** (every PR, not just API changes):
   - `CLAUDE.md` — project knowledge base
   - `docs/` — Pyreon-native documentation site (/docs, runs on /zero + /zero-content)
   - Package `README.md` files
   - `llms.txt` / `llms-full.txt` — AI reference files
   - `packages/tools/mcp/src/api-reference.ts` — MCP tool reference
   - JSDoc on exported APIs
   - Source comments where the WHY isn't obvious
   - `.claude/rules/anti-patterns.md` if a new anti-pattern was discovered
   - `.claude/rules/` — any other rule file relevant to the change

   Total: 9 surfaces. This list is unsustainable manually — see plan T2.1/T2.5.1 for the manifest-based generation that will collapse most of this to 1 source. The generator is now live: `bun run gen-docs` regenerates `llms.txt` from every `packages/<category>/<pkg>/manifest.ts` that exists. If a package has a `manifest.ts`, edit the manifest — do NOT touch the generated line in llms.txt directly; the `Docs Sync` CI job will fail if the two drift. Run `bun run gen-docs --check` locally for the same signal before pushing. Unmigrated packages (those without a `manifest.ts`) still need every surface updated by hand.

   **Rollback / override**: if a bug in `scripts/gen-docs.ts` blocks an urgent merge, a repo admin can temporarily remove `Docs Sync` from the required-checks list in branch-protection settings. File a follow-up to fix the generator, then restore the check. **Do not bypass by hand-editing generated lines** — the next gen-docs run will revert them silently.

   **Manifest snapshot tests**: each migrated package owns an inline-snapshot test of its rendered `llms.txt` bullet (see `packages/fundamentals/flow/src/tests/manifest-snapshot.test.ts` for the reference). Intentional format changes require updating the snapshot via `bun run test -- -u` in that package, or by accepting the new value in the failure diff via your editor. CI fails loudly on snapshot mismatch, so unintended regressions surface immediately.

   **MCP api-reference generation (T2.5.1)**: `bun run gen-docs` ALSO regenerates `packages/tools/mcp/src/api-reference.ts` between `// <gen-docs:api-reference:start @pyreon/<name>>` / `// <gen-docs:api-reference:end @pyreon/<name>>` marker pairs. Migration is opt-in per package: a package with markers gets its region generated from its manifest's `api[]`; a package without markers stays hand-written. To migrate a package to the pipeline:
   1. Enrich the manifest's `api[]` entries to MCP density — each `summary` is a dense 2-3 sentence paragraph (becomes MCP `notes`), each `mistakes` list is the real foot-gun catalog (6+ items for flagship APIs). The existing hand-written MCP entries are the quality bar.
   2. Wrap the existing hand-written `flow/*` / `query/*` / etc. block in `api-reference.ts` with the marker pair.
   3. Run `bun run gen-docs` — the region flips to generated.
   4. Add `renderApiReferenceEntries(manifest)` assertions to the package's `manifest-snapshot.test.ts` (see the flow reference — spot-checks entry count + key fields rather than a full-body inline snapshot, since MCP text is prose-dense and inline snapshots rot fast).

   Reference implementation: `@pyreon/flow` (PR landed T2.5.1). **Pipeline coverage is partial, not complete: ~33 of 55 published packages have a `src/manifest.ts`** (PR #319 onward; `@pyreon/compiler` migrating in #622). The remaining ~21 produce NOTHING in `llms.txt` / `llms-full.txt` / api-reference (they are absent, not hand-written) — so a "fix package X's MCP docs" task is a MIGRATION (create `manifest.ts` + `@pyreon/manifest` workspace devDep + marker pair + `gen-docs` + `manifest-snapshot.test.ts`) whenever `ls packages/<cat>/X/src/manifest.ts` comes up empty; verify that FIRST. Quality among the migrated set varies — `flow` / `query` / `form` / `hooks` are at MCP density (dense `summary`, 6+ `mistakes` per flagship API), more recently migrated packages start with verbatim ports of the prior hand-written entries. The un-migrated real-API backlog (`runtime-server`, `styler`, `rocketstyle`, `elements`, `attrs`, `coolgrid`, `kinetic`, `kinetic-presets`, `dnd`, `connector-document`) is worth closing; the tooling/scaffolding bucket (`cli` / `zero-cli` / `create-zero` / `meta` / `storybook` / `vite-plugin` / `typescript` / the 4 `*-compat` shims) should be explicitly exempted rather than given filler manifests.
5. No breaking changes without discussion
6. Honest quality assessment

## Debugging

- Check dependency versions + module resolution FIRST
- Use `registerErrorHandler` to surface silent errors
- Don't assume — verify with tests
- If workaround needed, document WHY and create follow-up
- Never blame upstream without reproducing in isolation

## Continuous Learning — MANDATORY

Every PR must include updates to rules and docs alongside the code changes. Don't submit code-only PRs when something was learned — update the rules in the SAME PR:

- **New anti-pattern discovered?** Add it to `anti-patterns.md` in the same commit.
- **New development pattern established?** Add it to `workflow.md` or `code-style.md` in the same PR.
- **API surface changed?** Update `CLAUDE.md`, `docs/`, `README`, `llms.txt`, `llms-full.txt`, MCP `api-reference.ts` as part of the same PR.
- **TypeScript/Bun/OXC quirk found?** Document it in the relevant rules file immediately.
- **Workaround added?** Document WHY in a code comment AND add to anti-patterns in the same commit.
- **Bug root cause identified?** Save to memory for future debugging AND document in anti-patterns if it's a recurring risk.

The rules files are your institutional memory. Update them as you work, not as a separate follow-up. A PR that changes behavior without updating docs is incomplete.

Also save learnings to persistent memory after each PR:

- **Patterns that worked** → feedback memory (validated approaches)
- **Patterns that failed** → feedback memory (what to avoid and why)
- **New project knowledge** → project memory (architecture decisions, API changes)
- **Bug root causes** → feedback memory (e.g. "compiler \_bindText detaches this on property access")

## Context Management

- Use `/compact` at ~50% context for long sessions
- Start complex tasks in plan mode
- Break work into steps that complete within context window
- Use subagents for parallel independent research
