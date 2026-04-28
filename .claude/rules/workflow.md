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
- **Read the active improvement plan** at `.claude/plans/ecosystem-improvements-2026-q2.md` — your task may already be addressed there or may conflict with the planned approach
- **Ask: symptom or cause?** When picking up a catalog item, ask whether the item is fixing a symptom or addressing the underlying cause. "F3: doc note" turned into 3 PRs because the right deliverable was "make the silent footgun impossible to hit" — not "add a doc note." If a tactical fix exists alongside a strategic one, decide which level to operate at and surface the trade-off explicitly. Don't silently expand scope and don't silently leave the cause unfixed.

## Code Changes

- Keep changes minimal — one feature per PR, one concern per file
- Follow naming: `signal()`, `computed()`, `effect()` for reactivity; `onMount`, `onUnmount` for lifecycle; `createX` for factories; `useX` for context hooks
- Export types separately from runtime values
- New APIs need JSDoc with `@example` blocks
- No unused imports, no dead code, no `// TODO` comments
- Error messages prefixed with `[Pyreon]` and include actionable guidance
- `__DEV__` guard all warnings — tree-shaken in production

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

1. `bun run lint` — whole repo (oxlint, ~3-15s)
2. `bun run --filter=<affected> typecheck` — affected packages only
3. `bun run --filter=<affected> test` — affected packages only;
   gracefully no-ops when the affected set has no test scripts (most
   examples)

Total runtime target: 30-60s for a typical PR. Catches the cheap-to-
detect failures locally instead of waiting 5 min for CI to bounce them.

**Bypass:**

- `PYREON_SKIP_PRE_PUSH=1 git push` — env-var bypass for one-off
  pushes (clearly named so it can't be mistaken for a permanent flag).
- `git push --no-verify` — git's native bypass.
- `git config --unset core.hooksPath` — disable repo-wide, keeps the
  hook script committed for whoever does want it.

**Re-enable after disabling:** `bun scripts/install-git-hooks.ts`.

**Why `core.hooksPath` instead of husky:** no new dev dependency, hook
is version-controlled (`.githooks/pre-push`), idempotent install,
respects an existing user-set hooksPath (won't clobber husky/lefthook
in a clone where someone has them wired up).

## Validation Checklist — Before EVERY Push

1. `bun run lint` — zero errors
2. `bun run typecheck` — zero errors (MCP pre-existing TS2589 is known)
3. `bun run test` — all tests pass
4. `bun run gen-docs --check` — no manifest/api-reference drift (catches the "I edited the generated file directly" mistake)
5. `bun run verify-modes` — every example × mode cell still produces correctly-rendered output (catches "typed-but-unimplemented" at the build-artifact level)
6. If you changed `ZeroConfig`, router types, or any public config-shaped surface: `bun run audit-types --all` — verify your new fields aren't typed-but-unimplemented at the type-surface level (zero non-type refs = bug)
7. If you changed runtime code in any package's `src/` (especially anything that might add bundle weight): `bun run check-bundle-budgets` — asserts each package's gzipped main-entry size stays within the budget locked in `scripts/bundle-budgets.json`. Lazy-loaded dynamic-import chunks are excluded by design. If growth is intentional, run `bun run check-bundle-budgets --update` and review the diff.
8. If you added or modified a published package's `package.json`: `bun run check-distribution` — asserts every published `@pyreon/*` package declares `sideEffects` and excludes `!lib/**/*.map` from `files`. Required for bundler tree-shaking + 19MB-saved-per-publish source-map exclusion. Includes a live `npm pack --dry-run` probe.
9. If you added/removed a hook in `@pyreon/hooks` or a `.md` file in `docs/`: `bun run check-doc-claims` — asserts the hook count and doc-page count claims in README/manifest/CLAUDE.md/docs index stay in sync with the actual source. Catches the drift where one claim site gets bumped and others don't.
10. If you changed runtime behavior of signals / mount / router / fs-router: `bun run test:e2e` — exercise primitives in real Chromium (~90s, requires Playwright Chromium via `bunx playwright install chromium`)
11. If API surface changed: update CLAUDE.md, docs/, README, llms.txt, llms-full.txt, MCP api-reference (via the manifest, not the generated file)
12. **NEVER merge PRs.** Open PRs and stop. Report the URL. The user merges every PR themselves. Never run `gh pr merge` (with or without `--auto`) unless the user explicitly says "merge it" for that specific PR. Authorization to merge does not generalize to follow-up PRs.

Steps 1-4 are local-fast (~10s combined). Steps 6-9 (audit-types, check-bundle-budgets, check-distribution, check-doc-claims) take ~5-15s. Steps 5 and 10 (verify-modes, test:e2e) take ~90s each — run before push, not after every commit. All run in CI as required checks; running them locally just shortens the feedback loop from "CI fails 5min after push" to "blocked locally, fix in 10s."

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
   - `docs/` — VitePress documentation website
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

   Reference implementation: `@pyreon/flow` (PR landed T2.5.1). Four migrated packages today (`flow`, `query`, `form`, `hooks`) have manifests; only `flow` is flipped to the MCP pipeline in the T2.5.1 ship — `query`/`form`/`hooks` get flipped in follow-up PRs as their `api[]` entries are enriched to MCP density.
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
