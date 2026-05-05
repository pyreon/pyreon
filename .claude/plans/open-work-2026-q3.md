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

#### Compiler-pass rocketstyle collapse

The compiler-pass collapse for rocketstyle is unimplemented. Validation already done by E2 (44× wall-clock on collapsed Buttons; 95.3% of rocketstyle call sites in real apps are statically resolvable — see [examples/experiments/e2-static-rocketstyle/RESULTS.md](../../examples/experiments/e2-static-rocketstyle/RESULTS.md) for the data). Runtime-side companion (`_rsMemo`) already shipped — this is the parallel compile-time leg.

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

**Open design questions** (RFC's "Open questions for review" — needs decision before phase 1):
1. Light + dark dual-emit vs single-emit (how do we handle theme switching?).
2. Sidecar manifest vs runtime introspection for pre-built `@pyreon/ui-components` consumers.
3. `__rs_collapsible: true` opt-in brand vs bail-on-callback heuristic.
4. Per-instance `_$tpl_42()` factory call vs inline `cloneNode`.

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
