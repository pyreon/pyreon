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
2. **Verify the bug — don't just claim it.** Before fixing, REPRODUCE it (preferably as a regression test). After fixing, prove the fix held with bisect-verify-with-restore (see workflow.md "Bisect-verify regression tests"). "I changed the code and the symptom went away" is not proof — it can be confused with caching, parallel-run flake, or unrelated side effects.
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
| **Check Doc Claims** | Adding/removing a docs page, or changing a count CLAUDE.md / README quotes (hook count, lint rule count, doc page count, etc.) | Run `bun run check-doc-claims` after touching `docs/` or any LOCKED count source |
| **Check Bundle Budgets** | Adding a new publishable package, or runtime growth in an existing one | `bun run check-bundle-budgets`; if growth is intentional, `bun run check-bundle-budgets --update` and review the diff |
| **Check Import Budgets** | A change made a canonical minimal import (`mount`-only, `signal/computed/effect`, basic router) bigger — usually an optional feature that stopped tree-shaking | `bun run check-import-budgets`; investigate WHY the minimal import grew (an eager import / lost `/*#__PURE__*/` / `sideEffects` regression) BEFORE relocking with `--update` |
| **Check Distribution** | New published package, or `package.json` `files` edit that drops `lib/**/*.map` | `bun run check-distribution` |
| **Check Release Readiness** | New published package missing `publishConfig.access: "public"` or absent from `.changeset/config.json` `fixed[0]` | `bun run check-release-readiness` |
| **Check Manifest Depth** | LOCKED package (`store`/`rx`/`query`/`form`) manifest density dropped | `bun run check-manifest-depth` |
| **Lint Ratchet** | A change pushed an oxlint `warn`-rule count above its `lint-baseline.json` count | `bunx oxlint .` to see the new finding → fix it (or scope/suppress with rationale). If you legitimately REDUCED counts, `bun run check-lint-ratchet -- --update` to tighten the baseline. NEVER raise a count to absorb a new finding |
| **Lint Ratchet** (pyreon-lint half) | A change pushed an `@pyreon/lint` advisory-rule count over framework `src` above its `pyreon-lint-baseline.json` count | `bun run lint:pyreon` to see the new finding → fix it, OR (if the rule doesn't apply to that framework package — e.g. `no-raw-addeventlistener` in `@pyreon/hooks`) scope it off in `.pyreonlintrc.json` with rationale. If you legitimately REDUCED counts, `bun run check-pyreon-lint-ratchet -- --update` to tighten. NEVER raise a count to absorb a new finding |
| **Diagnose Catalog** | Source change in `packages/core/{runtime-dom,runtime-server,core,compiler,router}/src/` without an `ERROR_PATTERNS` entry | Add entry to `packages/core/compiler/src/react-intercept.ts:ERROR_PATTERNS` OR add `skip-diagnose-catalog` label if genuinely catalog-irrelevant |
| **Release Build / Check Export Entries** | A published package's `exports` subpath `"./X"` doesn't have the `src/X.{ts,tsx}` entry the build tool derives from the KEY (e.g. `"./matchers"` but the file is `src/matchers-register.ts`). Builds fine on INCREMENTAL/cached CI, fails the release's CLEAN `build-batched` with `UNRESOLVED_ENTRY`, aborting the publish of EVERY package. | `bun run check-export-entries` (in `validate-fast`/pre-push) catches it in <1s; the `Release Build` CI job runs the literal `build-batched` + `publish.ts --dry-run` so the release build/pack can't fail. Fix: rename the file to `src/X.ts` OR change the export key to match — the tool derives entries from the KEY, not the bun/import/types target |
| **Docs Sync (gen-docs)** | Edited a `manifest.ts` without running `bun run gen-docs` to regenerate llms / api-reference | `bun run gen-docs && bun run gen-docs --check` |
| **Scaffold Smoke (monorepo-vercel)** | Workspace version ahead of npm (release in flight) | Auto-skipped by `shouldSkipIsolatedCell`; if it still fails, the npm-version check failed or your branch is named `changeset-release/*` |
| **Test (tools) — mcp `token-budget.test.ts` density caps** | Your new `anti-patterns.md` entry's index line is too DENSE (avg tokens/entry ≥ 55 or one line ≥ 100 tokens) — the budget is entry-count-relative, so a normally-dense new entry can never trip it; only verbosity does | Tighten the entry's TITLE + hook to catalog density (the index line is `- **title** [detector] — hook`). Do NOT raise the caps. If the 12,000-token design-boundary tripwire fires instead, the index has outgrown single-response form — paginate `get_anti_patterns`, don't bump |
| **Docs Sync / Docs Generated Fresh (concurrent-merge staleness)** | Your PR's generated docs were fresh when ITS CI ran, but ANOTHER PR touching generator inputs (`anti-patterns.md`, a `manifest.ts`, docs examples) merged after — branch protection is non-strict, so checks don't re-run on base movement; the LAST merger lands stale generated output on main | On a blocked PR: rebase onto `origin/main` + `bun run gen-docs && bun docs/scripts/gen-all.ts`, commit the regen. On main: the **Docs Freshness Guard** workflow (`docs-freshness-guard.yml`) detects drift on every main push and auto-opens an `auto/docs-regen` fix PR — merge it (self-healing; a red guard run = main is stale right now) |

When CI fails on a gate not in this list, ADD IT here in the same PR.
The list is the institutional memory; missing entries mean the trap
will repeat.

## Git Practices — MANDATORY

- **NEVER push directly to main** — always use feature branches + PRs
- **NEVER commit without running validation**
- Don't commit unless explicitly asked
- No force push, no amending published commits
- Descriptive commit messages focused on "why"
- Stage specific files, not `git add .`

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
14. If you changed source files in a PUBLISHED `@pyreon/*` package (i.e. a package whose `package.json` does NOT set `"private": true` AND is NOT in `.changeset/config.json` `ignore`): add a changeset via `bun changeset`. CI enforces this via the `Changeset` gate. The `skip-changeset` label bypasses for the rare case where a published-package source file changed but the change is genuinely catalog-irrelevant (comment-only edit, type-tightening with no runtime impact). The gate's detector intentionally excludes PRIVATE packages (`@pyreon/test-utils`, `@pyreon/manifest`, `@pyreon/perf-harness`, `@pyreon/vitest-config`, `@pyreon/playwright-config`, `@pyreon/devtools`, `@pyreon/ui-*`, every `@pyreon/native-*`), changeset-`ignore`d workspaces (examples, docs, ai-reference), AND test/spec/story files (`*.test.ts(x)`, `*.spec.ts(x)`, `*.stories.ts(x)`, anything under `tests/` / `__tests__/`) even inside a published package's `src/` — `scripts/publish.ts` strips `src/` from the published tarball entirely (`stripSrcFromFiles`), so test code never reaches consumers at all. Test-path classification is shared with the `check-diagnose-catalog` gate through ONE source of truth, `scripts/test-paths.ts` (`isTestPath`) — both gates import it, so the definition can't drift. So a test-only PR in a published package no longer needs a changeset OR the `skip-changeset` label. See `scripts/check-changeset-required.ts:isConsumerAffectingFile` + `scripts/test-paths.ts` for the classifier + `packages/internals/test-utils/src/tests/{check-changeset-required,test-paths}.test.ts` for the contract.
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
