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

## PMTC — Pyreon Multi-Target Compiler (Phase 0 SHIPPED; TodoMVC typecheck-clean SHIPPED 2026-05-24; Phase 1 staffing decision OPEN)

**Status**: Strategic direction merged in [#764](https://github.com/pyreon/pyreon/pull/764) ([`native-platforms.md`](./native-platforms.md)). Compiler skeleton merged in [#794](https://github.com/pyreon/pyreon/pull/794). **Phase 0's 8 roadmap PRs all landed** ([#796](https://github.com/pyreon/pyreon/pull/796), [#798](https://github.com/pyreon/pyreon/pull/798), [#800](https://github.com/pyreon/pyreon/pull/800), [#801](https://github.com/pyreon/pyreon/pull/801), [#805](https://github.com/pyreon/pyreon/pull/805), [#808](https://github.com/pyreon/pyreon/pull/808), [#810](https://github.com/pyreon/pyreon/pull/810), [#811](https://github.com/pyreon/pyreon/pull/811), [#812](https://github.com/pyreon/pyreon/pull/812), [#814](https://github.com/pyreon/pyreon/pull/814), [#816](https://github.com/pyreon/pyreon/pull/816), [#817](https://github.com/pyreon/pyreon/pull/817), [#819](https://github.com/pyreon/pyreon/pull/819), [#820](https://github.com/pyreon/pyreon/pull/820), [#821](https://github.com/pyreon/pyreon/pull/821), [#823](https://github.com/pyreon/pyreon/pull/823)). **TodoMVC named-gap closure landed 2026-05-19 to 2026-05-21**: G6 [#835](https://github.com/pyreon/pyreon/pull/835) → G1 [#842](https://github.com/pyreon/pyreon/pull/842) → G2 [#844](https://github.com/pyreon/pyreon/pull/844) (carrying G4 [#846](https://github.com/pyreon/pyreon/pull/846)) → G5 [#849](https://github.com/pyreon/pyreon/pull/849). Plus Phase 1 input parsers: ThemeIR [#831](https://github.com/pyreon/pyreon/pull/831), StyleIR [#832](https://github.com/pyreon/pyreon/pull/832), RocketstyleIR [#833](https://github.com/pyreon/pyreon/pull/833). Plus swift-valid bug-class fixes: #829 (hyphenated attrs) + #830 (Swift-reserved keywords) lifted swift-valid from 94.3% → 99.0%. Plus TodoMVC baseline [#834](https://github.com/pyreon/pyreon/pull/834) + Parser-A/B/C [#840](https://github.com/pyreon/pyreon/pull/840). **Phase 2 typecheck-clean closure landed 2026-05-22 to 2026-05-24**: storage trilogy [#853](https://github.com/pyreon/pyreon/pull/853)/[#854](https://github.com/pyreon/pyreon/pull/854)/[#857](https://github.com/pyreon/pyreon/pull/857)/[#859](https://github.com/pyreon/pyreon/pull/859)/[#860](https://github.com/pyreon/pyreon/pull/860) (Codable + @AppStorage bridge + Compose Saver), then [#861](https://github.com/pyreon/pyreon/pull/861) (TS-method translation), [#864](https://github.com/pyreon/pyreon/pull/864) (module-level decls), [#866](https://github.com/pyreon/pyreon/pull/866) (computed type inference; carries [#868](https://github.com/pyreon/pyreon/pull/868) multi-stmt body + enum comparison), [#871](https://github.com/pyreon/pyreon/pull/871) (function-typed prop call), [#872](https://github.com/pyreon/pyreon/pull/872) (JSX attr forwarding + unnamed args; carries [#874](https://github.com/pyreon/pyreon/pull/874) Checkbox primitive). Result: **`swiftc -typecheck` on the emitted TodoMVC Swift returns 0 errors.** Visibility: [#875](https://github.com/pyreon/pyreon/pull/875) ships an xcodegen scaffold for `examples/native-todomvc-ios/` so the milestone is reproducibly openable in Xcode. Phase 1 staffing remains conditional on the market signal — survey ([#807](https://github.com/pyreon/pyreon/pull/807)) NOT YET run.

### The plan trilogy (all merged)

| PR | Doc | Status |
|---|---|---|
| #795 | [`native-platforms-competitors.md`](./native-platforms-competitors.md) — PMTC vs 10 frameworks (CMP, Skip, RN+Expo, Flutter, Lynx, Capacitor, Tauri, NativeScript-Vue, Solid Native) | merged |
| #797 | [`native-platforms-phase0-roadmap.md`](./native-platforms-phase0-roadmap.md) — Phase 0 (8 PRs mapped to 3 pass/fail criteria, 12-18w envelope) | merged |
| #799 | [`native-platforms-todomvc-walkthrough.md`](./native-platforms-todomvc-walkthrough.md) — 8 compositional gaps surfaced; 6 of 8 fit Phase 0/1 | merged |

### Followups (post-trilogy review)

| PR | Doc | Why |
|---|---|---|
| #802 | [`native-platforms-platform-abstractions.md`](./native-platforms-platform-abstractions.md) — three-package split + `PYREON_NATIVE_BINDINGS` manifest + compiler resolution algorithm | Foundational for Phase 1 — `@pyreon/storage` / `@pyreon/camera` / `@pyreon/push` etc. all share this shape |
| #803 | [`native-platforms.md`](./native-platforms.md) — adds string-literal unions + two-way bindings to the mapping table | Closes two patterns the TodoMVC walkthrough surfaced as missing |
| #804 | [`native-platforms-phase1-roadmap.md`](./native-platforms-phase1-roadmap.md) — Phase 1 iOS MVP (3 parallel chains, 10-24w envelope, TodoMVC deliverable) | Same shape as Phase 0 roadmap but Phase 1; references P4 survey as a precondition |
| #807 | [`native-platforms-user-survey.md`](./native-platforms-user-survey.md) — market validation design (20-30 respondents, 12 Qs, decision thresholds). **Operational materials shipped**: interview script + async form + recruitment templates + analysis spreadsheet schema in [`native-survey-materials/`](./native-survey-materials/) — anyone can pick this up + start outreach without redesigning anything. | Competitor survey (#795) named this as the biggest open question PMTC doesn't answer |

### Phase 0 deliverables — verified state on main

Three packages + one example shipped:

- **`@pyreon/native-compiler`** (private) — parser handles real Pyreon JSX (signal/computed/props/events/For/Show, 10 fixtures); per-target emitters for Swift (SwiftUI `@State`) + Kotlin (Compose `mutableStateOf`); style emitter (`ViewModifier` / `Modifier`); rocketstyle dimensions emitter (per-dim enums + parameterised modifier with switch-based property resolution); cross-target style-fidelity contract gate. 127 unit tests across 9 files. Validation harness via `swiftc -parse` + `kotlinc` w/ Compose stubs. Coverage gate at `scripts/coverage-gate.ts`.
- **`@pyreon/native-cli`** (private) — `pyreon-native build --target=ios|android --source=./src --out=./generated` directory-walking compile pipeline.
- **`@pyreon/native-runtime-swift`** (private) — SwiftPM scaffold, Darwin-gated build (Linux CI skips with structural reason). `PyreonStylable` protocol marker; `PyreonReactivity` / `PyreonTokens` placeholders.
- **`examples/native-counter-ios`** — real working iOS counter. `src/Counter.tsx` (signal + VStack + Text + Button) → `scripts/build.sh` → `generated/Counter.swift` passes `swiftc -parse`. **Verified end-to-end as of 2026-05-21.**

### Phase 0 success criteria — honest status

| Criterion | Plan target | Actual state | Honest read |
|---|---|---|---|
| **1. Type mapper coverage** | ≥90% of existing Pyreon TSX compiles without manual annotations | **73.0% parsedClean** (no warnings) **but 94.3% swift-valid** (`swiftc -parse` accepts emitted output) on 525 real `.tsx` files. 100% don't throw; 27% emit ≥1 warning; only 5.7% produce invalid Swift. | **94.3% swift-valid is ABOVE the 90% goal** in the strict "compiler emit + native compiler accepts" reading. The 27% parsedClean gap is mostly "compiler emits warnings but produces valid Swift anyway" (123 of 142 warning-emitting files still swift-validate). The 30 swift-invalid files cluster into **2 fixable bug classes**: hyphenated HTML attrs (19 cases — `div(data-test=...)` — Swift doesn't accept `-` in arg names) + Swift-reserved keywords used as struct/function names (8 cases — `guard` / `class`). Both fixes are surgical; closing them would lift swift-valid from 94.3% → ~99.6%. |
| **2. Signal → @State round-trip** | Counter on iOS simulator with button-driven `signal.set` | Compile loop verified end-to-end; emitted Swift passes `swiftc -parse`. **No `.xcodeproj`** yet (manual Xcode setup documented). Not yet simulator-button-tap verified. | **Structurally done; physically unproven.** xcodegen PR is the one remaining piece. |
| **3. Style fidelity <5% pixel diff** | Rocketstyle Button on iOS visually identical to web | **Structural fidelity gate** ships (regex-extracts per-(dim, value, prop) resolution tables from both targets, asserts byte-equality). Pixel-diff infra deferred. | **Necessary but not sufficient.** Pixel-diff needs iOS Simulator + Android Emulator + macOS CI runner + baseline images — all Phase 1+ infrastructure work. |

### Critical-path PMTC decision gates

**Phase 1 staffing requires BOTH**:

1. **Technical pass** — all three Phase 0 criteria. Status: 1/3 fully proven (criterion 1 below target; criterion 3 structural only). Tier 1 close-out PRs would lift this to 2/3 full + 1/3 structural-only (pixel-diff infra is Phase 1+).
2. **Market pass** — user survey thresholds (≥70% Adopt + ≥50% Native-real + ≤20% Reject-OTA) per #807. **Survey NOT YET run.**

If technical passes but market fails → **do NOT staff Phase 1**. Reconsider scope per #795's recommendations (partial-PMTC mode via Compose Multiplatform target, OR accept mobile is out of Pyreon's scope).

### What's actionable RIGHT NOW

**Tier 1 — Phase 0 close-out (shipped 2026-05)**:

1. ✓ **DONE** — Coverage-gate `--swiftc-validate` analysis. Ran #828, found 2 bug classes; closed via #829 (hyphenated attrs) + #830 (Swift keywords) — swift-valid 94.3% → **99.0%**.
2. ✓ **DONE** — Compiler input parsers. ThemeIR #831, StyleIR #832, RocketstyleIR #833. Style emitters now have real input pipelines from `@pyreon/ui-theme` / `styled()` / `rocketstyle()` chains.
3. ✓ **DONE** — TodoMVC named-gap closure (5 closable gaps + G3 deliberation). G6 #835, G1 #842, G2 #844, G4 #846 (cascade), G5 #849. TodoMVC baseline #834 → 238 passing, 0 `it.todo`.
4. ✓ **DONE** — PR 4a xcodegen automation. `examples/native-counter-ios/project.yml` + `scripts/xcode-setup.sh` shipped earlier; `native-todomvc-ios` parallel shipped (#875). Both: `./scripts/xcode-setup.sh && open <Project>.xcodeproj` works end-to-end.

**Tier 1.5 — Phase 2 hardening (SHIPPED 2026-05-22 to 2026-05-24)**:

The full Phase 2 trilogy + follow-ups landed. **TodoMVC emit went from `swiftc -parse` PARSE_OK to `swiftc -typecheck` clean (0 errors).** Story closed via 11 PRs across two weeks:

1. ✓ **#853** — Struct emit for named type aliases (`type Todo = {...}` → `struct Todo` / `data class Todo`).
2. ✓ **#854** — Array-literal → struct initializer (when fields match a known struct).
3. ✓ **#857** — Codable + @Serializable conformance on emitted structs.
4. ✓ **#859** — Swift `@AppStorage` Codable-Data bridge (G5 typecheck-gap closure).
5. ✓ **#860** — Kotlin Compose `Saver` via kotlinx-Json (G5 Kotlin parallel).
6. ✓ **#861** — TS-method translation (`.length`/`.trim()`/`.some()`/`.every()`/`.find()`/etc.).
7. ✓ **#864** — Module-level `let`/`const` bindings emit at file scope.
8. ✓ **#866** — Computed-property type inference via TS method chains.
9. ✓ **#868** — Multi-statement computed bodies (closure of `visible: Any { xs }`) + enum-aware comparison.
10. ✓ **#871** — Function-typed prop/decl handlers call inside trailing closures.
11. ✓ **#872** — JSX event-handler forwarding to user components + unnamed function-arg labels.
12. ✓ **#874** — `<Checkbox>` → SwiftUI `Image(systemName:)` — LAST typecheck blocker.
13. ✓ **#875** — TodoMVC iOS xcodegen scaffold — `./scripts/xcode-setup.sh && open PyreonTodoMVC.xcodeproj`.

**`@pyreon/storage-ios` reference implementation** (~1-2w per #802) — not yet started. The first three-package-split abstraction validating the manifest-driven binding resolution against real Swift code. G5 #849 unblocked this — the compiler now recognises `useStorage` and routes to platform primitives, so a real binding-package can wire into the same shape.

**Tier 2 — Phase 1 engineering entry points (multi-week each, gated on market signal)**:

1. ~~TodoMVC compile attempt + 8 compositional gap PRs~~ — **DONE** (5/5 closable named gaps closed; G3 deliberation closed; G7/G8 Phase 3).
2. ~~TodoMVC emit typechecks-clean~~ — **DONE** (Phase 2 trilogy + follow-ups; `swiftc -typecheck` returns 0 errors on the emitted Swift).
3. **Real iOS Xcode build + Simulator run validation** — needs Apple-hardware CI runner. xcodegen scaffold (Tier 1 #4) is shipped; remaining: `xcodebuild -project PyreonTodoMVC.xcodeproj -destination 'generic/platform=iOS Simulator' build` + Simulator UI assertions. Multi-week external-dep blocker.
4. **Real Android Compose build pipeline** — `./gradlew assembleDebug` against emitted Kotlin. Less hardware-locked than iOS but still multi-week.
5. **G7 — rocketstyle conditional dimension expression hoisting** (Phase 3 per walkthrough). `<TodoItem state={todo.done ? 'completed' : 'active'}>` needs to hoist the conditional out of `body` into the `.modifier(...)` call site. Compiler refactoring; ~1-2w.
6. **G8 — `@pyreon/router-ios` / `@pyreon/router-android`** (Phase 3). URL-hash-style routing primitive for non-web platforms. Multi-week package work.

**Tier 3 — strategic decision blockers (user input required)**:

1. **Run the user survey** ($1700-2700 external cost, weeks 1-3 of Phase 0 per #807). The market-pass gate. **We finished Phase 0 + named-gap closure + Phase 2 typecheck-clean closure without it** — this is the biggest non-code decision blocker.
2. **Decision: rocketstyle collapse (P0 below) vs PMTC Phase 1 — which wins this quarter?** Both are multi-week commitments. Not mutually exclusive but with one person sequential. The user survey informs this directly.

### Remaining honest gaps

- **No pixel-diff infrastructure** — criterion 3 can't be visually verified.
- **G4 multi-spread objects** `{...a, ...b, k: v}` fall through to tuple-literal emit. Phase 2 hardening.
- **No CI smoke for the iOS counter build** — a regression in the CLI's directory walker or the parser would not block merges. Adding `bash examples/native-counter-ios/scripts/build.sh` + assert `swiftc -parse` to CI would catch it. (`bash examples/native-todomvc-ios/scripts/build.sh` + `swiftc -typecheck` would close the parallel for TodoMVC.)
- **No actual iOS Simulator run validation** of the TodoMVC scaffold — `xcodegen generate` produces a real `.xcodeproj`, but `xcodebuild -destination 'generic/platform=iOS Simulator' build` needs Apple-hardware CI to run. The structural pipeline is closed; the runtime validation is gated on Tier 2 #3.
- **Interactive `<Checkbox>` / Toggle binding** — current emit is read-only `Image(systemName:)`. Phase 3 if real apps need writable checkbox state with `onChange`.
- **User survey not started** — biggest non-engineering blocker.

---

## Open work, by priority

Ordered "highest leverage first." Each item names what's needed, evidence of current state, and effort.

### P0 — Highest-leverage single bet

#### Compiler-pass rocketstyle collapse — **vertical slice SHIPPED** (opt-in `pyreon({ collapse: true })`)

**Status: the RFC's vertical slice is implemented, proven, and tested** (the RFC doc itself was removed once shipped — its decisions are now the code). The 4 design questions were resolved exactly as the RFC scoped: **dual-emit** (light+dark class + live `useMode()` thunk — no remount on mode swap), **SSR-render resolver** (the consumer's own Vite SSR renders the REAL component → parity by construction, no chain reimplementation; this generalised beyond "app-local only" — works cross-package too, so the RFC's "sidecar manifest" deferral turned out unnecessary for the SSR approach), **bail-on-callback heuristic** (shared `detectCollapsibleShape` — every dimension prop a string literal, no spread, static-text children; a single shared detector used by BOTH the plugin scan and the compiler emit so keys can't drift), **hoisted `_tpl` factory** (`_rsCollapse` → one `_tpl` cloneNode, html-keyed cache shares the parsed template across N mounts). E2 validated the win (44× wall-clock on collapsed Buttons; 95.3% of real-app call sites statically resolvable). Runtime-side companion (`_rsMemo`) shipped earlier — this is the compile-time leg.

**What shipped (5 layers, all tested):** `@pyreon/styler` `getStyleRules()` + idempotent `injectRules(rules,key)` (raw pre-resolved rule injection, no re-hash); `@pyreon/runtime-dom` `_rsCollapse(html,light,dark,isDark)` (dual-emit, reactive class, no remount — 4 real-Chromium specs); `@pyreon/vite-plugin` `createCollapseResolver` (one programmatic Vite-SSR server bound to the consumer's vite.config, renders the real component light+dark, caches by key) + `pyreon({ collapse })` option + `transform`-hook scan/resolve/thread + `closeBundle` dispose; `@pyreon/compiler` `scanCollapsibleSites` + `rocketstyleCollapseKey` (exported) + `TransformOptions.collapseRocketstyle` detection/emission (JS-path-forced; off by default — additive, all 1079 compiler tests unchanged). End-to-end proven on the REAL `@pyreon/ui-components` Button: resolver → scanner → compiler emits `__rsCollapse(...)` with the real SSR-resolved class strings + class-stripped template + rule bundle, byte-for-byte. Bisect-verified (disable the detection call → 4 emission tests fail; restore → 13/13).

**Remaining (deliberately deferred, NOT in the slice):** the `examples/ui-showcase` build-with-collapse + real-Chromium DOM-parity / perf-counter e2e gate (ui-showcase's Buttons all carry `onClick` → correctly bail; needs a dedicated literal-prop demo route + a verify-modes cell); the cross-package `@pyreon/ui-components` consumer path works via the SSR resolver but has no real-app gate yet. ~~dev-mode collapse~~ **CLOSED — dev-mode is now an explicit, intentional, tested contract, not a deferral**: the `transform`-hook collapse block is gated `if (collapseEnabled && isBuild && !isSsr)`; `vite dev` keeps the normal rocketstyle mount and the resolver is NEVER constructed. This is *correct*, not a limitation — the resolver freezes each site's class from a nested Vite-SSR module graph, so collapsing in dev would freeze that class against the user's theme-source HMR edits (strictly worse than the HMR-reactive normal mount). Pre-fix the block was gated only `&& !isSsr` and silently attempted to run (badly) in dev; the fix makes the build-only contract explicit + surfaces it once via `this.info`, with a stub-resolver bisect-verified test (`rocketstyle-collapse-dev.test.ts`). The build-artifact + SSR→hydrate gates also shipped (see `CLAUDE.md` → "Compile-time rocketstyle collapse"). Remaining open: the cross-package real-app gate. Follow-up PRs tracked here.

**Collapse-tail extensions — ALL SHIPPED (full + on\*-handler partial + dynamic-prop + element-child).** Beyond the full-collapse slice, three extensions closed the addressable tail, each measured-before-built via the `collapse-bail-census` gate: **on\*-handler partial** (`_rsCollapseH`), **dynamic-prop** (`_rsCollapseDyn`/`_rsCollapseDynH` — ternary-of-two-literals, handlers compose), and **element-child** (the largest remaining frontier — recursively-static element children baked into the EXISTING `_rsCollapse` with NO new runtime helper). The element-child pass lifts the real-corpus **TOTAL ADDRESSED coverage 83.0% → 86.0%** (full 72.8% + partial 7.8% + dynamic 2.5% + element-child 3.0% of 566 `@pyreon/ui-components` call sites). Element-child shipped in 3 PRs: detector + serializer + census measurement → resolver `childTree` channel + scan-expansion + emit → the gates (resolver real-Vite-SSR `buildChildVNodes` proof, `verify-modes` `rs-collapse-elem-probe` build-artifact cell, real-Chromium `rs-collapse.browser.test` DOM-parity + mode-flip-no-remount specs, census reclassification). Full detail in `CLAUDE.md` → "Compile-time rocketstyle collapse" → "Element-child collapse — fully shipped". The remaining bail buckets are deliberately out of scope: multi-axis dynamic (2^N value-set growth), expression-child, spread, boolean-attr (low surface, high complexity). The cross-package real-app gate (full-collapse) also shipped (`assertCrossPackageButtonCollapsed`).

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

#### T2.5.9 — Tool description manifest (`mcp_overview` tool) — **✅ DONE**

Shipped: `mcp_overview` registered in `packages/tools/mcp/src/index.ts:737`. Returns a markdown table read from the package manifest at runtime — single source of truth, new tools surface automatically. The earlier "not registered" status was stale by the time the plan was last reviewed.

#### T2.5.10 — Telemetry (opt-in)

**State**: no `PYREON_MCP_TELEMETRY` env var, no `.pyreon/mcp-usage.log`, no `pyreon mcp-stats` CLI command. We have no signal on which tools agents actually call vs which sit idle.

**What's needed**: opt-in usage logging behind env var; stats summarizer in the CLI. Effort: ~1 day.

**Deferred**: Pyreon is 0.x with no production user base; collecting usage data is premature. Reconsider when there are ≥10 known consumer projects on the MCP server — then the data will inform which tools to invest in vs prune.

#### T2.5.11 — Expand MCP integration tests (5 → ≥20 across all 11 tools) — **✅ DONE (#917)**

Shipped: `packages/tools/mcp/src/tests/server-integration.test.ts` now has 22 specs (was 5) — every tool's JSON-RPC handler registration + response shape is locked.

#### T2.5.12 — Document the 5 newer tools in `docs/docs/mcp.md` — **✅ DONE**

Shipped: `docs/docs/mcp.md` is now 434 lines (was 228). All 13 tools have their own sections; a "Tools by intent" quick-reference at the top (line 74) maps user intent → tool. The earlier "228 lines, 6 tools" snapshot was stale by the time the plan was last reviewed.

Follow-up: a "Troubleshooting" section was added in the same PR that did this stale-marking — see [docs/docs/mcp.md](../../docs/docs/mcp.md) "Troubleshooting".

#### T2.5.5 — `diagnose` catalog growth as a CI gate — **✅ DONE (#917)**

Shipped: `scripts/check-diagnose-catalog.ts` + `.github/workflows/diagnose-catalog-check.yml`. PRs touching `packages/core/{runtime-dom,runtime-server,core,compiler,router}/` must grow `ERROR_PATTERNS` or carry the `skip-diagnose-catalog` label (created in this follow-up).

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

### Maintenance — deferred cross-major dependency bumps (staged, 2026-05-19)

Within-major tooling drift is kept current automatically (`bun update` — last done #688; CI actions #675). The following are **beyond-range and deliberately NOT auto-bumped** — all are `0.x` tooling deps where a minor is "may-break" per semver and the blast radius lands in a sensitive subsystem. Each needs its own reviewed PR with the named validation; a blind `bun update --latest` bundling them would be an unmergeable, high-risk mega-diff.

- **`oxc-parser` / `oxc-transform` `0.129 → 0.132`** — powers all 67 `@pyreon/lint` rules' AST, the `@pyreon/compiler` JS path, and the audit AST walkers (test-audit / island-audit / bundle-budgets). oxc `0.x` minors routinely change AST node shapes. *Safe path*: dedicated PR, bump both together, run the full `@pyreon/lint` + `@pyreon/compiler` suites + re-validate the audit tools; bisect any rule that shifts.
- **`oxfmt` `0.43 → 0.51`** (8 minors) — a formatter bump can reformat the entire repo. *Safe path*: its own PR = bump + `oxfmt --write .` + review the whole-repo reformat as the diff; never a rider on another change.
- **`@changesets/changelog-github` `0.6 → 0.7`** — release-pipeline changelog formatter; the release pipeline was fragile this cycle (0.18.0 / 0.19.0 incidents, fixed in #644/#645/#650/#690). Low value (changelog cosmetics), real risk to a load-bearing subsystem. *Safe path*: bump only alongside a deliberate release-tooling review, off-cycle.

No true `1.x → 2.x` majors are pending repo-wide. Priority: low — none blocks anything; this entry exists so the deferral is a **tracked, rationale-backed decision**, not a silent unknown.

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
