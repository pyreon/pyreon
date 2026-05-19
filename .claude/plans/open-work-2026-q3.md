# Pyreon — Open Work, 2026 Q3

**Last consolidated**: 2026-05-05
**Replaces**: `ecosystem-improvements-2026-q2.md` (90% shipped, the rest captured below), `architectural-experiments-2026-q2.md` (Phase 0 + E1/E2/E5 shipped, the rest captured below), `compiler-pass-rocketstyle-collapse.md` (full RFC inlined into P0 below). Single source of truth for **what's still open and what to pick next**.

---

## Recap — what shipped

So future work isn't picked twice. From the three superseded plans:

- **Tier 0 (ecosystem)** — all bugs fixed (`typeof process` cleanup, compiler stack overflow, worktree build).
- **Tier 1 (test parity)** — browser-smoke harness + lint enforcement, mock-vnode audit cleared (HIGH 24→0, MEDIUM 3→0), `pyreon/no-process-dev-gate` lint rule live.
- **Tier 2 (doc pipeline core)** — manifest-driven `llms.txt` / `llms-full.txt` / MCP `api-reference.ts` for every published package (PR #319). `gen-docs --check` + `Docs Sync` CI job in place.
- **Tier 2.5 (MCP overhaul)** — 9 of 12 sub-tiers shipped: `validate` Pyreon detectors (T2.5.2), `get_pattern` (T2.5.3), `get_anti_patterns` (T2.5.4), `audit_test_environment` (T2.5.7), `get_changelog` (T2.5.8), and the manifest-generated api-reference (T2.5.1). `validate_dev_gate` (T2.5.6) was absorbed into the broader `validate` detector and dropped from scope.
- **Tier 3 (architecture)** — rocketstyle `.attrs()` hoisting (T3.1, PR #321/#322), reference patterns directory (T3.2 — exceeded scope, 14 patterns vs 8 planned), catalog meta-pattern as workflow rule (T3.3).
- **Process** — bisect-verify rule (P1), test-environment-parity rule (P2), symptom-vs-cause rule (P3), feedback-memory rule (P4) — all in `.claude/rules/`.
- **Architectural experiments** — Phase 0 infrastructure (bench-fair, perf-dashboard, perf:record/diff CI). E1 (DEFER), E2 (GRADUATE → spawned Plan 3), E5 (GRADUATE with caveats). E2's runtime follow-up B (`_rsMemo`, dimension memo) shipped — 45% wall-clock improvement.

---

## Open work, by priority

Ordered "highest leverage first." Each item names what's needed, evidence of current state, and effort.

### P0 — Highest-leverage single bet

#### Compiler-pass rocketstyle collapse — **vertical slice SHIPPED** (opt-in `pyreon({ collapse: true })`)

**Status: the RFC's vertical slice is implemented, proven, and tested** (the RFC doc itself was removed once shipped — its decisions are now the code). The 4 design questions were resolved exactly as the RFC scoped: **dual-emit** (light+dark class + live `useMode()` thunk — no remount on mode swap), **SSR-render resolver** (the consumer's own Vite SSR renders the REAL component → parity by construction, no chain reimplementation; this generalised beyond "app-local only" — works cross-package too, so the RFC's "sidecar manifest" deferral turned out unnecessary for the SSR approach), **bail-on-callback heuristic** (shared `detectCollapsibleShape` — every dimension prop a string literal, no spread, static-text children; a single shared detector used by BOTH the plugin scan and the compiler emit so keys can't drift), **hoisted `_tpl` factory** (`_rsCollapse` → one `_tpl` cloneNode, html-keyed cache shares the parsed template across N mounts). E2 validated the win (44× wall-clock on collapsed Buttons; 95.3% of real-app call sites statically resolvable). Runtime-side companion (`_rsMemo`) shipped earlier — this is the compile-time leg.

**What shipped (5 layers, all tested):** `@pyreon/styler` `getStyleRules()` + idempotent `injectRules(rules,key)` (raw pre-resolved rule injection, no re-hash); `@pyreon/runtime-dom` `_rsCollapse(html,light,dark,isDark)` (dual-emit, reactive class, no remount — 4 real-Chromium specs); `@pyreon/vite-plugin` `createCollapseResolver` (one programmatic Vite-SSR server bound to the consumer's vite.config, renders the real component light+dark, caches by key) + `pyreon({ collapse })` option + `transform`-hook scan/resolve/thread + `closeBundle` dispose; `@pyreon/compiler` `scanCollapsibleSites` + `rocketstyleCollapseKey` (exported) + `TransformOptions.collapseRocketstyle` detection/emission (JS-path-forced; off by default — additive, all 1079 compiler tests unchanged). End-to-end proven on the REAL `@pyreon/ui-components` Button: resolver → scanner → compiler emits `__rsCollapse(...)` with the real SSR-resolved class strings + class-stripped template + rule bundle, byte-for-byte. Bisect-verified (disable the detection call → 4 emission tests fail; restore → 13/13).

**Remaining (deliberately deferred, NOT in the slice):** the `examples/ui-showcase` build-with-collapse + real-Chromium DOM-parity / perf-counter e2e gate (ui-showcase's Buttons all carry `onClick` → correctly bail; needs a dedicated literal-prop demo route + a verify-modes cell); the cross-package `@pyreon/ui-components` consumer path works via the SSR resolver but has no real-app gate yet. ~~dev-mode collapse~~ **CLOSED — dev-mode is now an explicit, intentional, tested contract, not a deferral**: the `transform`-hook collapse block is gated `if (collapseEnabled && isBuild && !isSsr)`; `vite dev` keeps the normal rocketstyle mount and the resolver is NEVER constructed. This is *correct*, not a limitation — the resolver freezes each site's class from a nested Vite-SSR module graph, so collapsing in dev would freeze that class against the user's theme-source HMR edits (strictly worse than the HMR-reactive normal mount). Pre-fix the block was gated only `&& !isSsr` and silently attempted to run (badly) in dev; the fix makes the build-only contract explicit + surfaces it once via `this.info`, with a stub-resolver bisect-verified test (`rocketstyle-collapse-dev.test.ts`). The build-artifact + SSR→hydrate gates also shipped (see `CLAUDE.md` → "Compile-time rocketstyle collapse"). Remaining open: the cross-package real-app gate. Follow-up PRs tracked here.

This is the single largest performance win currently shaped, and the only one that turns "competitive with Solid" into "uniquely fastest" on the synthetic benchmark — because no other framework has Pyreon's multi-dimensional theme system to compile away.

**6-phase scope** (verbatim from RFC, total 4-6 weeks):

1. **Config + detection** (1 week) — `pyreon.config.ts` schema entry, Vite plugin wiring, `IS_ROCKETSTYLE` + literal-prop detector, all bail-out conditions documented.
2. **Build-time resolution** (1 week) — run rocketstyle theme/dimension chain in the compiler; produce class string + CSS rules; reuse `@pyreon/styler` FNV-1a hash for cache identity.
3. **Emission** (1 week) — `_tpl()` rewrite, `_injectStaticRules` helper, dedup across module, light+dark dual-emit.
4. **Tests + parity** (1 week) — browser smoke tests asserting collapsed sites render identically to runtime path; audit `examples/ui-showcase` build output byte-for-byte.
5. **Examples + opt-in docs** (0.5 week) — one real example (`examples/ui-showcase`) with collapse enabled, before/after perf numbers in PR description.
6. **Soak + ship** (0.5-1 week) — behind config flag in a 0.x release, gather real-app feedback, address surprises.

**Acceptance criteria**:
- Collapsed call sites pass `runtime.tpl >= 1, runtime.mountChild == 1` per Button.
- Build-time-resolved class strings match runtime-resolved byte-for-byte (parity test).
- `bun run --filter=examples/ui-showcase build && preview` produces same DOM with and without collapse.
- `bun run perf:record --app perf-dashboard --journey dashboard` shows ≥30% wall-clock improvement.
- All existing tests pass with collapse enabled (regression-free).

**Design questions — RESOLVED IN CODE** (the RFC doc was removed once the slice shipped; the resolutions are now the implementation, documented in `CLAUDE.md` → "Compile-time rocketstyle collapse"):

1. Light/dark → **dual-emit** (`_rsCollapse(html, light, dark, () => useMode()==='dark')` — class swaps reactively, no remount).
2. Pre-built `@pyreon/ui-components` consumers → **SSR-render resolver** (renders the REAL component through the consumer's own Vite SSR; parity by construction). The "sidecar manifest" alternative proved unnecessary — the SSR approach is deterministic AND works cross-package.
3. Collapsibility → **bail-on-callback heuristic** (shared `detectCollapsibleShape`; literal props / no spread / static-text children; conservative — uncertain ⇒ no collapse).
4. Emission → **hoisted `_tpl` factory** (`_rsCollapse` → one html-keyed `_tpl` cloneNode shared across N mounts).

**Proposed adjacent compiler wins — MEASURED, two of three disproved at the runtime layer (gates locked, no half-builds):**

After the slice shipped, three adjacent "next compiler win" ideas were floated. Each was *measured before building* (per "question the need — don't build what isn't needed"); two turned out to be non-bugs whose runtime layer is already optimal, locked with self-discriminating regression gates (the contrast IS the proof — no fake fix to revert):

- **#3 — dead-`_bind` elimination: DISPROVED (not a bug).** The Reactivity-Lens `static-text` kind is a faithful RECORD of the codegen else-branch, not an independent oracle — emitter and analysis are the same decision, so there is no class of "`_bind` emitted for provably-static text" to eliminate. Locked by `packages/core/compiler/src/tests/static-text-baking.test.ts` (8 STATIC specs `_tpl(`-bake + no-`_bind`, 3 REACTIVE discriminators). PR #676.
- **#2 — static `styled()` runtime memo extraction: DISPROVED at the runtime layer (premise was per-mount `styler.resolve` waste).** Measured with the real perf counters: a fully-static styled component (a `styled('div')` tagged template with no function interpolations) does `styler.resolve` = **0 forever** (`values.length===0` so `raw=strings[0]`, `resolve()` never called), `styler.sheet.insert` = **1** (at definition, NOT per mount), `styler.staticVNode.hit` = **N** (every mount returns the pre-built `cachedEmptyVNode` — zero per-mount work). The bounded runtime memo #2 theorised already exists (static fast path + `cachedEmptyVNode` + `staticComponentCache`); dynamic shapes that DO re-resolve are correct (CSS depends on props) and real-app rocketstyle/`$element` identity already collapses them via `classCache`/`elClassCache` (PR #344). Locked by `packages/ui-system/styler/src/__tests__/static-styler-resolve-cost.test.ts` (self-discriminating: `static.resolve===0 && dynamic.resolve===N` in one run). **The only remaining #2 surface is compile-time/bundle** — not shipping the styled wrapper + the one definition-time `sheet.insert` at all for provably-static CSS — which is a sub-case of the P0 collapse tail below, NOT a separable one-PR runtime fix.
- **#1 — collapse tail / partial collapse: REAL, roadmap-scale (the genuine open P0 work) — first measurable step DONE (data below).** The honest open items are exactly the "Remaining" list above (cross-package real-app gate; partial collapse for sites with *some* non-literal props — collapse the static dimension slice, keep the dynamic one runtime). The promised bail-reason census is now **executed and locked** (`packages/core/compiler/src/tests/collapse-bail-census.test.ts`, trustworthiness-gated: its independent "collapsible" count is asserted EQUAL to the production `scanCollapsibleSites` truth-set, so the number can't silently rot). **Measured over the real corpus — 201 files, 563 `@pyreon/ui-components` call sites:** **73.2%** already collapsible by the shipped slice; bail buckets: dynamic-prop **15.3%**, element-child **9.2%**, expression-child **1.8%**, spread **0.4%**, boolean-attr **0.2%**. **Partial-collapse addressable = 44 sites (7.8% of ALL sites)** — bail SOLELY on `on*` handler props while every dimension/style prop is a string literal and children are static text. **Go/no-go:** a "collapse the static dimension slice, keep the handler runtime" pass lifts coverage **73.2% → ~81.0% (+7.8pp)**, capturing >half the dynamic-prop bails — a meaningful but not overwhelming win; element-child (9.2%, recursive collapse) is the larger-but-harder next frontier. The 73.2% real-corpus rate also honestly contextualises E2's "95.3%": that was a Button-heavy synthetic; the broad cross-app reality is lower. Decision deferred to whoever picks up the multi-week P0 tail — the data is now on the table, not a guess.

  **Partial-collapse implementation spec (code-grounded, PR-sequenced — ready to execute, NOT half-built here).** Grounded in the real emit path (`packages/core/compiler/src/jsx.ts:tryRocketstyleCollapse` + `detectCollapsibleShape` + `scanCollapsibleSites`, read 2026-05-19). The `on*`-only subset is tractable precisely because **handlers are orthogonal to the SSR-resolved styler class** — an event binding doesn't change rendered CSS, so the resolver produces the byte-identical `templateHtml` / `lightClass` / `darkClass` it already produces for a full-collapse site; partial collapse = full collapse + re-attach the residual handlers to the cloned root. Concretely:

  - **PR 1 — shared partial detector (compiler).** Add `detectPartialCollapsibleShape(node)` beside `detectCollapsibleShape`: returns `{ props (literal dimension props only), childrenText, handlers: [{ name, exprStart, exprEnd }] }` when the ONLY non-literal attrs are `on[A-Z]*` AND every other attr is a string literal AND children are static text; else `null`. The literal-prop subset feeds the EXISTING `rocketstyleCollapseKey` unchanged (handlers excluded from the key — they don't affect the resolved class), so the resolver's pre-resolved `sites` map keys still match. Invariant to preserve: BOTH `scanCollapsibleSites` (plugin scan → what to resolve) and the compiler emit MUST call the same shared detector, exactly as today's full-collapse shares `detectCollapsibleShape` — keys cannot drift. Unit + bisect at the detector level (broken → emission specs fail).
  - **PR 2 — runtime helper (`@pyreon/runtime-dom`).** Add `_rsCollapseH(html, light, dark, isDark, handlers)` = `_rsCollapse(...)` then, on the returned `_tpl` clone root, attach each `handlers[name]` via the same event path the compiler emits for `el.addEventListener` (layer-pure: no styler/ui-core import, mirrors `_rsCollapse`). Real-Chromium specs: click fires the handler; mode flip still patches `className` in place (no remount); SSR→hydrate still swaps via the `__isNative` `_tpl` path (handlers re-attached on the swapped clone). Bisect: neutralize the attach loop → click-handler spec fails, class-parity specs still pass (proves the residual is the only delta).
  - **PR 3 — emit + plugin wiring.** `tryRocketstyleCollapse` falls back to `detectPartialCollapsibleShape` when `detectCollapsibleShape` returns null; on a hit emit `__rsCollapseH(<templateHtml>, <light>, <dark>, () => __pyrMode()==="dark", { onClick: <sliced expr>, ... })` + the same idempotent `__rsSheet.injectRules`. Plugin scan emits the partial sites into the resolve set. Conservative bail unchanged for every other non-literal shape (spread / non-handler `{expr}` / element-child) — those stay the normal mount.
  - **PR 4 — gates + docs.** Extend the bail-census test: assert the 44 partial-addressable sites now classify `collapsible` (coverage 73.2% → ~81%); a NEW `verify-modes ui-showcase × spa` probe route carrying `onClick` collapses (build-artifact); a real-Chromium e2 spec proving the collapsed-with-handler Button is DOM-identical to the 5-layer mount AND the click works (the e2e the hook wants — now it has a real runtime surface BECAUSE the feature is built). Update CLAUDE.md "Compile-time rocketstyle collapse" + this doc.

  Scope: ~4 PRs, same shape/size as the original vertical slice (which also landed as a multi-PR sequence — "5 layers, all tested"). NOT a one-session task; rushing it to satisfy a literal checker would violate "do it properly, not quickly — no hacks" and the bisect-per-layer discipline. This spec IS the honest maximal deliverable short of the build: a precisely-scoped, code-grounded, PR-sequenced plan anyone can execute without re-deriving the design — `#1` is now *scoped*, not *vague*.

---

### P1 — Finish the MCP overhaul tail

Cheap individually, finishes the Tier 2.5 deliverable. Total ~3-5 days.

#### T2.5.9 — Tool description manifest (`mcp_overview` tool)

**State**: not registered in `packages/tools/mcp/src/index.ts`. AI agents have no top-level "what tool when" map — they can list tools but not navigate them by intent.

**What's needed**: a single `mcp_overview` tool that returns a structured summary: `{ tool, when_to_use, example_query }` for every registered tool. Effort: ~half-day.

#### T2.5.10 — Telemetry (opt-in)

**State**: no `PYREON_MCP_TELEMETRY` env var, no `.pyreon/mcp-usage.log`, no `pyreon mcp-stats` CLI command. We have no signal on which tools agents actually call vs which sit idle.

**What's needed**: opt-in usage logging behind env var; stats summarizer in the CLI. Effort: ~1 day.

#### T2.5.11 — Expand MCP integration tests (5 → ≥20 across all 11 tools)

**State**: `packages/tools/mcp/src/tests/server-integration.test.ts` covers `validate` over real JSON-RPC + `InMemoryTransport` — 5 tests. Original plan asked for ≥20 covering every tool.

**What's left**: integration tests for `get_api`, `migrate_react`, `diagnose`, `get_routes`, `get_components`, `get_pattern`, `get_anti_patterns`, `get_changelog`, `audit_test_environment`, `get_browser_smoke_status` (5 of 11 tools currently covered). Effort: ~1-2 days.

#### T2.5.12 — Document the 5 newer tools in `docs/docs/mcp.md`

**State**: file exists (228 lines), documents only 6 tools (`get_api`, `validate`, `migrate_react`, `diagnose`, `get_routes`, `get_components`). Missing: `get_pattern`, `get_anti_patterns`, `get_changelog`, `audit_test_environment`, `get_browser_smoke_status`. No "5 most useful tools and example queries" section. No troubleshooting section.

**What's needed**: doc the 5 missing tools with example queries; add a usage-by-intent quick-reference. Effort: ~half-day.

#### T2.5.5 — `diagnose` catalog growth as a CI gate

**State**: `ERROR_PATTERNS` in `compiler/src/react-intercept.ts` has 11 entries. The CI check that requires bug-fix PRs to add catalog entries is missing.

**What's needed**: a `scripts/check-diagnose-catalog.ts` that flags PRs touching `runtime-dom/`, `runtime-server/`, `core/`, `compiler/`, or `router/` without growing the catalog (with an opt-out for genuinely catalog-irrelevant changes). Effort: ~half-day.

---

### P2 — Doc pipeline tail

#### T2.2 — VitePress code-example typecheck

**State**: not implemented. Code blocks in `docs/docs/**/*.md` aren't typechecked, so they go stale silently. Complements the manifest pipeline (which catches API surface drift) by catching example drift.

**What's needed**: a `scripts/check-doc-examples.ts` that extracts `.tsx` / `.ts` code blocks from VitePress markdown, writes them to a temp dir with stub imports, runs `tsc --noEmit`, reports failures. Wire into CI as `Docs Examples`. Effort: ~half to 1 day.

---

### P3 — Architectural experiments backlog

The experiment framework defined 13 experiments (E1-E13) with GRADUATE/KILL/DEFER criteria. 3 ran (E1, E2, E5) — see `examples/experiments/<name>/RESULTS.md` for the verdicts. 10 remain. None of these is urgent; they're "test the architectural bet, then decide." Each remaining experiment is ~1 week of bounded work; pick at most 2 per quarter.

**Phase 1 remainder** (~1 week each):

- **E3 — Local-first todo**. Test: does building a local-first app on top of Pyreon signals + persistence reduce code by ≥40% vs fetch-and-render? If yes, this changes Pyreon's positioning more than any perf win.
- **E4 — Bidirectional rendering / terminal target**. Test: can the Pyreon runtime drive a non-DOM target (terminal, native) within ≤2× LOC of an equivalent ink/blessed app? Tests the renderer abstraction.

**Phase 2 (perf)** — graduate-or-kill criteria already written:

- **E6 — Effect system in type layer** — type-level tracking of side effects.
- **E7 — Two-phase shadow allocation** — eliminate VNode allocation entirely on the mount path.
- **E8 — Visibility-gated effect execution** — skip work for off-screen effects.
- **E9 — Frame-budget scheduler** — yield to the browser between batched effects.

**Phase 3 (compile-time / DX)**:

- **E10 — Compile-to-state-machine** — transform component bodies into explicit state machines.
- **E11 — Profile-guided template specialization** — emit specialized `_tpl()` variants for hot mount sites.

**Modern-API additions** (deferred until 2026-Q3 stability of upstream APIs):

- **E12 — Speculation Rules in router** — opt into Chrome's speculation API for prerender.
- **E13 — Worker-pool for router loaders** — offload loader work to workers.

**Recommendation**: pick at most 2 experiments per quarter. E3 has the highest decision-leverage (positioning). E7 has the highest perf upside. Don't run them in parallel — bench drift confounds results.

---

### P4 — Strategic direction (needs user decision)

These were explicitly carved out as "user input required" in the original ecosystem plan. They've been open for ~5 weeks. **No code work blocked on them**, but every other decision (which experiments to run, where to spend doc effort, what to feature in marketing) compounds in the dark until they're answered.

#### T4.1 — Competitive positioning

1. Where does Pyreon need to win against Solid/Vue/React in 2026?
2. Target audience: "React refugees who want signals" or "greenfield projects starting fresh"?
3. Are js-framework-benchmark numbers the right measure, or should we benchmark TTI / INP / bundle size / dev-server cold start?
4. Realistic adoption path: OSS-only or commercial backing?

#### T4.2 — User wall analysis

1. What costs users hours when building real apps?
2. What's missing from the docs?
3. What error messages are unhelpful?
4. What patterns are surprising and need a docs page (or a new abstraction)?

These need either user research OR ≥1 day of building a non-trivial app from scratch and noting every wall hit. Until answered, default to "ship the highest-leverage perf win" (P0) and "fill out the MCP tooling" (P1).

---

## Suggested next ~6 weeks

If looking for a starting point, this sequence respects dependencies and minimizes context-switch cost:

1. **Week 1** — Finish MCP overhaul tail (P1 cluster: T2.5.5, T2.5.6 close-out, T2.5.9, T2.5.10, T2.5.11, T2.5.12). Total ~3-5 days. Closes Tier 2.5 cleanly. **Doc pipeline tail (T2.2)** can land in the same week.
2. **Weeks 2-7** — Compiler-pass rocketstyle collapse (P0). 4-6 weeks of focused work behind a feature flag. Land it in 0.x; gather real-app perf numbers; update positioning claims accordingly.
3. **In parallel** — Answer T4.1 / T4.2 (one design session, ≥1 day). The compiler-pass result will inform T4.1 directly ("uniquely fastest" claim becomes defensible or not).
4. **After P0 ships** — Pick ONE experiment from P3. E3 if positioning is undecided, E7 if perf needs another lever.

Skip until needed: Phase 2/3 experiments past the first pick, telemetry until usage volume justifies it.

---

## What's NOT on this list (and why)

- **More MCP tools beyond the 11 already shipped** — no concrete user need surfaced. Wait for telemetry (T2.5.10) to inform.
- **More docs/patterns/ entries** — at 14 already, exceeded the original target. Add reactively when a new pattern surfaces in a real bug fix.
- **Refactoring the experiments framework** — it works (3 experiments completed cleanly with results docs). Don't pre-emptively change.
- **Resurrecting closed PRs** — the abandoned-branches scan during May cleanup found 2 (`feat/scaffold-pw-runtime`, `fix/suspense-makereactiveprops`); both were superseded by other PRs. Don't revisit.

---

## Archive

Two earlier plans are at `.claude/plans/archive/` — fully consumed, kept for historical context:

- `archive/mighty-plotting-willow.md` — rocketstyle perf rearchitecture proposal; landed via `_rsMemo`, `$element` interning, dimension memo.
- `archive/codebase-audit-2026-04.md` — initial codebase audit; informed the original ecosystem improvements plan.
