# Pyreon Native Initiative — Readiness Audit (2026-06)

## Headline scorecard

| Surface | Score | 1-line summary |
|---|---|---|
| Compiler emit (Swift) | 81/100 | All 15 canonical primitives + control flow + 7 hooks wired and `swiftc -parse` gated; loader-data silently dropped, lifecycle primitives "walled," canonical-primitive emit not in swiftc fixture loop. |
| Compiler emit (Kotlin) | 80/100 | All 15 primitives + control flow + 7 hooks wired and `kotlinc` gated end-to-end via K-FINAL TodoMVC; Kotlin fixture set is 7 vs Swift's 10. |
| Runtime (Swift) | 80/100 | 7 of 9 services real with 50 XCTest cases; `PyreonReactivity.swift` + `PyreonTokens.swift` are documented stubs (SwiftUI primitives ARE the reactive layer). |
| Runtime (Kotlin) | 60/100 | 6 of 9 services real; missing `PyreonReactivity.kt`, `PyreonTokens.kt`, `PyreonViewModifier.kt`; 38 test functions are smoke `main()`, NOT JUnit-discoverable. |
| Routers (Swift + Kotlin) | 62/100 | Core nav + global guards + redirect (+ re-entry) are solid (88-95); `beforeEnter` runtime missing (25), `useParams` not auto-populated (55), nested routes absent (5 — `RouterView` is `EmptyView()`). |
| CI gates | 58/100 | Real toolchains + real device gates wired but **zero native check is on branch-protection's required list**; path-filtered/label-opt-in only. |
| Example apps | ~67/100 | TodoMVC iOS/Android/web prove one-source contract structurally (80); router-demo-ios has no XCUITest (75); no Android router-demo; **real-app showcase (auth-gated "multitask") does not exist (0)**. |
| Docs + scaffold | 43/100 | Scaffolder works (60); multiplatform.md comprehensive (72); but no supported-TS-surface enumeration (18), no asset pipeline (22), no native perf/bundle telemetry (8), **zero multiplatform-awareness in Lens/LPIH/devtools (5)**. |
| **Overall native-readiness (weighted)** | **~66/100** | Compiler+runtime+routers (weight 2×) average 73; CI (weight 1.5×) at 58; examples + docs (weight 1×) average 55. Demo-quality, not production-ready. |

Weighting rationale: compiler/runtime/routers determine *whether the framework works*; CI determines *whether it stays working*; examples + docs determine *whether users can adopt it*. The framework half is materially ahead of the gate + adoption half.

## Critical gaps (the 5 biggest blockers to 100%)

### CRIT-1: Zero native checks on branch-protection's required list
**Evidence:** Live `gh api repos/pyreon/pyreon/branches/main/protection` shows 24 required contexts — none of them native. `.github/workflows/native-validate.yml:28-31` is path-filtered to `packages/native/**`; `native-device.yml:28-34` explicitly: "Advisory — NOT in branch-protection's required checks." A change in `packages/core/compiler/` that cascades through PMTC silently merges to main with zero native coverage.
**Fix:** Promote `native-validate` to required (Phase A). Track green streak on `native-device` for 2-3 weeks, then promote. Fix size: L (requires green-streak track record).

### CRIT-2: Nested routes / `RouterView` is `EmptyView()` no-op
**Evidence:** `packages/native/router-swift/Sources/PyreonRouter/RouterView.swift:30-39` is `EmptyView()`; `RouterView.kt:42-47` emits nothing. `grep -rnE "nested|children:" packages/native/router-{swift,kotlin}` returns zero hits. No `RouteRecord.children`, no chain-based depth resolution. Comment Swift:25-28 / Kotlin:23-26: "Phase C2+ extends this with declarative route definitions." Item scored **5/100**.
**Fix:** Native route-table dispatcher with depth-indexed `<RouterView />` matching web router's matched-chain. Fix size: L.

### CRIT-3: `beforeEnter` runtime absent + `useParams` not auto-populated
**Evidence:** Per-route guards: `grep -rnE "beforeEnter" packages/native/router-{swift,kotlin}` returns ZERO source hits — only compiler-side parsing at `packages/native/compiler/src/parse.ts:598,848,862`. Item scored **25/100**. `useParams`: `Hooks.swift:64-66` / `Hooks.kt:67-71` read `router.params` directly; `matchPath` exists (PyreonRouter.swift:269-307, kt:268-305) but is NEVER called from `push`/`replace` to populate `params`. Hooks.swift:61-62 comment: "Phase C1 ships SCAFFOLD: returns the active router's `params` dictionary directly. Real pattern-matching against route definitions lands in Phase C2+." Item scored **55/100**.
**Fix:** Wire matchPath into push/replace, populate params from match groups, attach per-route guards to the dispatcher. Fix size: L (depends on CRIT-2's route-table).

### CRIT-4: `useLoaderData` silently dropped on both targets
**Evidence:** No `useLoaderData` in `packages/native/compiler/src/emit-{swift,kotlin}.ts`. `canonical-primitives.test.ts:901-919` explicitly: "only path+component captured; name/meta dropped for v1." NOT in the diagnostic-warning catalog (46 warning tests, none for loaderData drop). Cross-cuts router maturity AND undermines `setLoaderData` infrastructure that already ships (PyreonRouter.swift:215-229, kt:90-98).
**Fix:** Emit loader functions + compile-time wiring so navigation calls `setLoaderData` per-route, OR add a silent-drop diagnostic. Fix size: M.

### CRIT-5: Real-app showcase does not exist + DX surfaces have zero native awareness
**Evidence:** Scout 3 grepped `multitask`, `auth-gated.*native`, "real-app showcase" — **zero hits beyond unrelated content.** TodoMVC is the only non-trivial example. Scout 4: Reactivity Lens (compile-time), LPIH (fire-count inlay hints), devtools panel — **none has any iOS/Android awareness** (`grep packages/native/**` returns 2 comment mentions only, no implementation files). Item scored **5/100**. Combined: a user adopting native gets zero of the dev-tooling that web users get, AND no showcase proves anything beyond TodoMVC works on native.
**Fix:** Build a multi-screen auth-gated showcase exercising signal-driven state + router + loaders. Separately, scope multiplatform-awareness for at least devtools/LPIH (likely structurally infeasible for some surfaces since PMTC erases the signal layer into SwiftUI/Compose primitives). Fix size: XL (showcase + DX awareness separately).

## Per-surface detail

### Compiler emit — Swift (81/100)

10 items audited. **2 at 90+** (A6 props handling 90, A9 diagnostic warnings 92). 8 below threshold:

| Item | Score | Gap | Fix size |
|---|---|---|---|
| A1 Canonical primitives Swift | 90 | All 15 wired but canonical-primitive emit NOT in `validate-swift.test.ts` swiftc fixture loop (only legacy `<VStack>`/`<HStack>` fixtures) | S |
| A2 Control flow (Show/For) | 95 | Fixture-only; no nested/accessor-as-`when` swiftc corner-case gate | XS |
| A3 Reactivity decls | 85 | `PyreonReactivity.swift:7,16-19` still "SCAFFOLD ONLY" / "Phase 0"; effect-with-dep-list documented as future | S |
| A4 Hooks Swift | 88 | No dedicated `useStorage` or `useFetch` test files (indirect via TodoMVC); 7 hooks otherwise covered | S |
| A5 Router emit Swift | 75 | `useLoaderData` NOT emitted, NOT diagnosed — silent drop (CRIT-4) | M |
| A7 Token resolution Swift | 80 | `PyreonTokens.swift:19-22` still STUB (`"0.0.0-phase0-scaffold"`); theme integration not wired to `@pyreon/ui-theme` | S |
| A8 Lifecycle (Suspense/ErrorBoundary/KeepAlive/Transition) | 65 | 3 of 4 "walled" — emit children-only; no fallback/error/cache semantics. Intentional per "Phase 5 frontier" | L |
| A10 swiftc validation gate | 80 | `-parse` only (no `-typecheck`, Linux toolchain lacks SwiftUI); typecheck-clean status only via label-gated macos-15 device runner | S |

### Compiler emit — Kotlin (80/100)

10 items audited. **2 at 90+** (B2 control flow 95, B6 props handling 90, B9 warnings 92 — 3 actually). 7 below threshold:

| Item | Score | Gap | Fix size |
|---|---|---|---|
| B1 Canonical primitives Kotlin | 88 | All 15 wired (CLAUDE.md "8/15" claim is CLOSED); per-primitive comment at `canonical-primitives.test.ts:12-19` stale ("kotlinc validation is deferred"), bottom of file proves it's running | S |
| B3 Reactivity decls Kotlin | 82 | NO `PyreonReactivity.kt` file (Swift has scaffold); Compose's `mutableStateOf` is the primitive so functional no-op, but parity broken | S |
| B4 Hooks Kotlin | 85 | NO `PyreonColorScheme.kt` (reads `LocalConfiguration.current` directly per emit, no runtime needed); functional but parity gap | S |
| B5 Router emit Kotlin | 73 | Same `useLoaderData` drop (CRIT-4) | M |
| B7 Token resolution Kotlin | 82 | NO `PyreonTokens.kt` file in Kotlin runtime; `emit-tokens.ts` covers both targets via 4 tests only | S |
| B8 Lifecycle Kotlin | 65 | Same walling as A8 | L |
| B10 kotlinc validation gate | 78 | Kotlin fixture loop is 7 vs Swift's 10 (missing 08/09/10); Android device gate exists but label-gated advisory | S |

### Runtime — Swift (80/100)

9 services + 50 XCTest cases. 7 services are real implementations (`PyreonStorage` 222 LOC, `PyreonFetch` 124, `PyreonForm` 85, `PyreonPermissions` 76, `PyreonNetworkStatus` 106, `PyreonClipboard` 109, `PyreonViewModifier` 35). 2 are documented stubs by design: `PyreonReactivity.swift:16-19` ("SCAFFOLD ONLY"), `PyreonTokens.swift:4-9` (stub — scoped Phase 2.5+). Real reactive contract intentionally delegates to SwiftUI `@State`/`@AppStorage`. XCTest can't import SwiftUI's `@AppStorage` under Linux toolchain — runs against UserDefaults directly. No 90+ filter applies; service-level. Fix size for closing parity stubs: M.

### Runtime — Kotlin (60/100)

6 services + 38 smoke test functions. **Missing 3 of 9 services Swift has:** no `PyreonReactivity.kt`, no `PyreonTokens.kt`, no `PyreonViewModifier.kt`. **Tests are NOT JUnit-discoverable** — invoked via `main()` smoke from `scripts/verify-kotlin.ts`. `PyreonStorageTest.kt:7-17` explicit: "NOT a real JUnit test suite — JUnit + Compose-test artifacts require the full Android stack...this package intentionally avoids depending on." Real Compose recomposition + DataStore wiring NOT verified. Real-device Android gate exists (`native-device.yml:138-241`) but label-gated advisory. Fix size: M (JUnit-discoverable test migration + 3 missing service files).

### Routers (62/100)

10 items audited across both targets. **1 at 90+** (item 1 core navigation 92, item 7 redirect 95 — 2 actually). 8 below threshold:

| Item | Score | Gap | Fix size |
|---|---|---|---|
| 1 Core navigation | 92 | No `forward()`; NavigationStack hardware-back-gesture parity not real-device verified | XS |
| 2 Path matching | 78 | **No wildcard-404 / catch-all fallback**; matchPath is a STATIC helper, NOT wired into a route-table dispatcher | S |
| 3 useParams | 55 | **`params` never auto-populated by navigation** (CRIT-3) — Hooks comment "SCAFFOLD only" | M |
| 4 useLoaderData runtime | 80 | No loader-runner integration; `setLoaderData` called only manually; Kotlin coverage 1 test vs Swift 4 | S |
| 5 beforeEnter per-route guards | 25 | **Runtime has NO per-route guard concept** (CRIT-3); compiler parses, runtime ignores | L |
| 7 redirect | 95 | Naming differs from web ("throw redirect" idiom); no cross-platform unified API surface | XS |
| 8 Nested routes | 5 | **RouterView is `EmptyView()`/no-op** (CRIT-2); no route table; no depth indexing | L |
| 9 Memory hygiene (LRU) | 85 | `beforeEachGuards` + `afterEachHooks` UNBOUNDED; no `.removeGuard` API on either target (Class C risk per `.claude/rules/anti-patterns.md`) | XS |
| 10 Test coverage + bisect locks | 72 | Kotlin tests use hand-rolled `expect`/`expectEq` (NOT JUnit); hardcoded `${33}` summary at PyreonRouterTest.kt:335 drifted (actual 34); no SwiftUI/Compose rendering tests; no real-device gate | S |

**Swift⇄Kotlin drift surfaced by Scout 2:** Swift uses `@Observable` + `NavigationStack(path:)` two-way binding; Kotlin uses bare `MutableState<List<String>>` + `CompositionLocalProvider` with NO `NavHost` wrapping (deliberate — RouterProvider.kt:50-56). Swift gets back-gesture/animation FREE; Kotlin requires host wiring. `PyreonLink` API diverges: Swift `@ViewBuilder label` vs Kotlin `content: @Composable (navigate: () -> Unit) -> Unit` (caller-wraps-clickable).

### CI gates (58/100)

8 items audited. **0 at 90+.** All below threshold:

| Item | Score | Gap | Fix size |
|---|---|---|---|
| 1 native-validate compile-only gate | 55 | NOT in branch protection (CRIT-1); path-filtered to `packages/native/**` → cross-cutting changes uncovered; `swiftc -parse` only (no `-typecheck` on Linux) | M |
| 2 native-device workflow | 65 | Advisory only (`native-device.yml:28-34`); promote-to-required commitment has no tracking issue | M |
| 3 iOS XCUITest | 70 | Single assertion (root view renders); no interaction (add/toggle/filter/delete); iPhone 15 device name hard-coded fragile | S |
| 4 Android Compose-instrumented test | 70 | Same single-assertion limitation; KVM permissions hand-patched per run, no retry policy | S |
| 5 `Test (native)` matrix shard | 50 | Vitest under Node only — NO swiftc/kotlinc toolchain; emit-validation lives in path-filtered, NOT-required `native-validate` | M |
| 6 Validate emitted Swift + Kotlin | 60 | `-parse` only; typecheck-clean claim verified locally per PR but not continuously in CI | M |
| 7 **Branch protection required native checks** | **15** | **ZERO native checks required on main** (CRIT-1) | L |
| 8 Native runtime tests in CI | 50 | Toolchains installed only in path-filtered/label-opt-in workflows; main `Test` matrix never runs Swift/Kotlin toolchains | M |

### Example apps (~67/100)

8 items audited. **0 at 90+.** All below threshold:

| Item | Score | Gap | Fix size |
|---|---|---|---|
| B1 native-todomvc-ios | 80 | No iPad/iPhone size-class testing; single UITest assertion; first-build needs xcodegen + bun in PATH | S |
| B2 native-todomvc-android | 78 | Missing `gradlew` wrapper; CI installs Gradle via SDKMAN sha-unpinned; KVM permissions per-run | S |
| B3 native-todomvc-web | 75 | NO e2e gate (no playwright project, no verify-modes cell); imports cross-example via relative path → fragile | S |
| B4 native-router-demo-ios | 75 | **No `iosUITests/` directory** — no XCUITest; no Android sibling exists | S |
| B5 native-router-demo-web | 70 | No CI gate exercises this example; not in verify-modes | S |
| B6 One-source contract | 80 | Structurally proven (Android `build.sh:25-26` reads iOS path; web `entry-client.tsx:11` imports iOS path); naming misleading ("iOS owns" but source is shared) | XS |
| B7 create-multiplatform scaffolds | 70 | Generated tree verified by file-tree test ONLY; scaffold-generated apps NOT booted end-to-end in CI | S |
| B8 **Real-app showcase ("multitask")** | **0** | **Does not exist** (CRIT-5); Phase F+ roadmap unwritten | L |

### Docs + scaffold (43/100)

10 items audited. **1 at 90+** (JSX auto-import 95 — plan's regex-claim was outdated/false; PMTC uses `oxc-parser` AST). 9 below threshold:

| Item | Score | Gap | Fix size |
|---|---|---|---|
| multiplatform.md completeness | 72 | Off-by-one: status banner says "15 canonical primitives" while table lists 16 (CLAUDE.md:263 says 16); no "supported TS surface" section; no per-target setup beyond high-level | S |
| Per-target setup docs | 38 | "Setup" story = "use scaffolder"; zero docs on integrating into existing Xcode/Gradle, SwiftPM vs CocoaPods, etc. | M |
| `init({ navigate })` wiring | 55 | Mentioned once in a table row; no dedicated section; iOS/Android equivalent unstated | S |
| **Supported-TS-surface audit** | **18** | No single doc enumerates what PMTC accepts/drops/warns-on; 20+ scattered "silently dropped" comments in `parse.ts:98,279,319,535,626,776,800,1055,1347,1445`; critical DX gap | L |
| Native asset pipeline | 22 | `pyreonIcon` is a STUB; no SF-Symbol↔Material-Icon mapping; no local-image bundling; fonts unaddressed (multiplatform.md:236 explicit deferral) | L |
| Native bundle-size / perf telemetry | 8 | No `check-bundle-budgets` cell for native packages; no emit-size measurement; no .ipa/.apk size tracking | L |
| create-multiplatform CLI UX | 60 | No interactive prompts, no `--template`/`--git`/`--install`, no toolchain checks, no kebab-case validation, no colored "next steps" output | M |
| CLAUDE.md PMTC section accuracy | 55 | **Self-contradicts and contradicts multiplatform.md** — "Phase A in progress" while doc-site says "✅ Done"; "6-primitive web runtime" stale (now 15); "16" vs "15" off-by-one; no mention of 6 native data hooks that landed | S |
| **Lens/LPIH/devtools multiplatform-awareness** | **5** | **ZERO iOS/Android awareness** (CRIT-5); PMTC erases signals into SwiftUI/Compose primitives → invisible to Pyreon's analysis layer; not even acknowledged as a gap | XL |

## Roadmap to 100% — sequenced PR plan

### Phase A — Close critical-gap blockers (8-10 PRs, ~4-5 weeks)

**PR-A1: Wire `native-validate` into branch-protection required checks**
Scope: Patch branch-protection `required_status_checks.contexts` via `gh api PATCH` sub-resource (full PUT wipes omitted fields — see `.claude/rules/anti-patterns.md` "Branch-protection drift"). Add only `Validate emitted Swift + Kotlin` initially, NOT the advisory device workflows.
Acceptance: `gh api repos/pyreon/pyreon/branches/main/protection | jq '.required_status_checks.contexts'` returns the new context; a deliberate emit-break PR fails the gate.
Dependencies: None — purely a config change.

**PR-A2: Promote native-validate to run on EVERY PR (drop path filter)**
Scope: Remove the `paths: packages/native/**` filter from `native-validate.yml:28-31`. Cross-cutting changes in `packages/core/compiler/` cascade through PMTC and must be gated.
Acceptance: A PR touching only `packages/core/compiler/` triggers `native-validate`.
Dependencies: PR-A1 (so the gate is required before broadening).

**PR-A3: Add `useLoaderData` silent-drop diagnostic**
Scope: Extend `parse.ts` warnings catalog with `useLoaderData` detection; emit a warning when seen in source pending real emit. Add test under `native-silent-drop-warnings.test.ts`.
Acceptance: A fixture using `useLoaderData()` produces a warning; the 47th warning test passes.
Dependencies: None.

**PR-A4: Native route-table dispatcher (Swift + Kotlin)**
Scope: Add `RouteRecord` shape with `children`; build a runtime route table from compiler-emitted definitions; wire `matchPath` into `push`/`replace` to populate `params`; replace `RouterView.swift:30-39` `EmptyView()` with depth-indexed render. Mirror in Kotlin. Closes CRIT-2.
Acceptance: New Swift + Kotlin tests: nested route renders correct depth-1 leaf; `useParams()` reads matched groups after navigation. Bisect-verified.
Dependencies: None — but unblocks A5 + A6.

**PR-A5: `beforeEnter` per-route guards wired to dispatcher**
Scope: Attach compiler-extracted `beforeEnter` to route records; run before navigation commits; respect existing `_inGuard` re-entry skip. Closes CRIT-3 (per-route portion).
Acceptance: Test asserts guard runs on per-route nav; false return blocks; re-entry doesn't infinite-loop.
Dependencies: PR-A4 (needs route table).

**PR-A6: Wildcard-404 catch-all support**
Scope: Add `(.*)` route matching to dispatcher; `notFoundComponent` analog on `RouteRecord`. Web router has it (CLAUDE.md router section), native parity.
Acceptance: Unknown path renders the 404 component on both targets.
Dependencies: PR-A4.

**PR-A7: Bound `beforeEachGuards` + `afterEachHooks`; add `removeGuard` API**
Scope: Apply Class C unbounded-cache discipline from `.claude/rules/anti-patterns.md`. LRU cap (suggest 32 — guard chains are tiny in practice) OR explicit `removeGuard(fn)` returning a disposer from the registration call. Add tests for both targets.
Acceptance: Guard arrays stay bounded under 1000-mount loop; bisect-verified.
Dependencies: None.

**PR-A8: Reconcile CLAUDE.md PMTC section with doc-site**
Scope: Update `CLAUDE.md:250-273` — fix "Phase A in progress" → "Phase A-E ✅ Done" alignment with `multiplatform.md:212-220`; fix "6-primitive web runtime" → 15; fix "15"/"16" off-by-one (pick one and propagate); add 6 native data hooks; add router-swift/router-kotlin runtime mentions. Run `bun run check-doc-claims`.
Acceptance: CLAUDE.md and multiplatform.md agree on primitive count and phase status; doc-claims gate green.
Dependencies: None.

### Phase B — Capability parity (~10-12 PRs, ~6-8 weeks)

Goal: close the runtime/test-infra gaps surfaced as 50-80 items.

- **Kotlin runtime parity**: add `PyreonReactivity.kt`, `PyreonTokens.kt`, `PyreonViewModifier.kt` (3 PRs, S each).
- **Kotlin test migration**: 38 smoke `main()` functions → JUnit-discoverable (Robolectric where possible, real Compose-test under Gradle). 1-2 PRs, M each.
- **`PyreonTokens.swift` + theme integration**: replace stub with real `@pyreon/ui-theme` consumer wiring. 1 PR, M.
- **Kotlin fixture parity**: add 08/09/10 fixtures to `validate-kotlin.test.ts` loop. 1 PR, S.
- **Canonical-primitive emit in swiftc fixture loop**: add canonical-primitive fixtures to `validate-swift.test.ts:36-63`. 1 PR, S.
- **`useLoaderData` real emit + loader-runner**: emit loader functions wired to `setLoaderData` per route. 1 PR, M.
- **Lifecycle primitives — best-effort un-walling**: Suspense fallback via SwiftUI `task` modifier where feasible; ErrorBoundary via `task(priority:)` + try/catch wrapper. Document remaining limitations honestly. 2-3 PRs, L total.
- **Swift `forward()` + back-gesture parity**: Real-device verify. 1 PR, S.

### Phase C — Verification: real-device CI promotion + regression locks (~5-7 PRs, ~3-4 weeks)

Goal: convert advisory device gates into branch-protection-required.

- **PR-C1: 2-week green-streak tracking issue for `native-device`**: open issue, track per-run status, no auto-merge.
- **PR-C2: XCUITest interaction coverage**: expand from single root-render assertion to add-todo, toggle, filter, delete, error-state. Mirror in Android Compose-instrumented test.
- **PR-C3: Bisect-verified regression locks** for every Phase A/B fix. Pattern: revert → fail with specific error → restore → pass. Document in each PR body per `.claude/rules/testing.md`.
- **PR-C4: iPhone 15 device-name unpin**: Read latest iOS Simulator from `xcrun simctl list devices available` (per `native-device.yml:118-119` acknowledgment of fragility).
- **PR-C5: Promote `native-device` to required** (after green streak verified).
- **PR-C6: Scaffold-generated apps end-to-end CI**: boot a fresh `create-multiplatform` output through `xcodebuild` + `gradlew` in CI. Catches the silent-broken-scaffold bug class.
- **PR-C7: Web variant e2e gate**: Add `native-todomvc-web` to `playwright.config.ts` projects + verify-modes cell.

### Phase D — DX polish (~12-15 PRs, ~6-8 weeks)

Goal: convert 43/100 docs+scaffold to 80+/100.

- **Supported-TS-surface reference doc** (largest gap — 18/100): new `docs/docs/pmtc-supported-syntax.md` enumerating every accept/drop/warn shape. Cross-link from every parse.ts "silently dropped" comment. 1 large PR or 3-4 smaller ones, L total.
- **Real-app showcase ("multitask")**: Multi-screen, auth-gated, router-driven, signal-state app. Mirror on iOS/Android/web. Becomes the second canonical example. 4-6 PRs, XL total.
- **Asset pipeline (Phase D-async)**: real `pyreonIcon` runtime (Material `ImageVector` registry); SF-Symbol↔Material-Icon cross-map; local-image bundling (Xcode `Assets.xcassets` + Android `res/drawable`); fonts. 3-4 PRs, L total.
- **Native bundle-size telemetry**: `check-bundle-budgets` cells for emitted Swift/Kotlin LOC + .ipa/.apk binary-size tracking in `native-device.yml`. 1-2 PRs, M.
- **Per-target setup docs**: integrate-into-existing-Xcode, integrate-into-existing-Gradle, SwiftPM vs CocoaPods, dedicated `init({ navigate })` section. 1 PR, M.
- **`create-multiplatform` UX polish**: interactive prompts, `--template`, `--git`, `--install`, toolchain checks, colored output. 1 PR, M.
- **Lens/LPIH/devtools multiplatform-awareness**: HONEST scoping. PMTC erases signals into SwiftUI `@State`/Compose `mutableStateOf` — Pyreon's analysis layer cannot see the resulting reactive graph at runtime. Realistic deliverable: Reactivity Lens compile-time hints work as-is (analyze the pre-emit source); LPIH likely infeasible without a Pyreon-side runtime shim; devtools likely infeasible. Document the constraint in `multiplatform.md` rather than promise infeasible features. 1 PR, S (mostly an honest-doc PR).

## Verification per phase

**Phase A done when:**
- `gh api ... required_status_checks.contexts` contains `Validate emitted Swift + Kotlin`.
- A deliberate emit-break PR fails branch protection.
- New router-runtime tests pass: nested-route depth-1 render, per-route `beforeEnter` blocks nav, `useParams()` populated by navigation, wildcard-404 fires, guard arrays bounded under 1k-mount loop.
- `useLoaderData()` produces a diagnostic warning.
- `bun run check-doc-claims` green; CLAUDE.md and multiplatform.md agree.

**Phase B done when:**
- `packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/` contains all 9 services (parity with Swift).
- Kotlin tests run via `gradlew test` (JUnit-discoverable), not `bun run --filter='@pyreon/native-runtime-kotlin' verify`.
- `validate-{swift,kotlin}.test.ts` fixture loops are equal (both 10).
- Lifecycle primitives: at least Suspense + ErrorBoundary have best-effort emit (not walled); KeepAlive remains documented limitation.
- `useLoaderData` produces real emit on both targets; integration test asserts `setLoaderData` is called per navigation.

**Phase C done when:**
- 2 consecutive weeks of green `native-device` runs on `main`.
- `native-device` is in `gh api ... required_status_checks.contexts`.
- XCUITest + Android Compose-instrumented tests exercise add/toggle/filter/delete (not just root render).
- Every Phase A+B PR carries a "Bisect-verified: reverted X, test failed with Y, restored, test passed" line in its body.

**Phase D done when:**
- `docs/docs/pmtc-supported-syntax.md` exists with every accept/drop/warn shape enumerated; every `parse.ts` "silently dropped" comment links to it.
- A real-app showcase ("multitask" or similar — name negotiable) exists at `examples/native-multitask-{ios,android,web}` with shared source; CI builds + boots it on real Simulator/Emulator.
- `check-bundle-budgets.json` includes native cells; `.ipa`/`.apk` size tracked in `native-device.yml` artifacts.
- `multiplatform.md` honestly describes which DX surfaces (Lens/LPIH/devtools) work on native vs which are structurally infeasible.
- `bunx create-multiplatform my-app` produces interactive prompts + colored "next steps" output.

## Honest disclosure (what this audit could NOT verify)

1. **No scout could boot a real iOS Simulator or Android Emulator.** The XCUITest + Compose-instrumented tests exist as source files; whether they actually pass on the macos-15 / ubuntu-latest runners depends on (a) the device-name pin not breaking on runner-image refresh, (b) KVM permissions on the Android side. Real-device verification requires triggering `native-device.yml` with the label and inspecting recent runs — scouts only verified the workflow source.
2. **Typecheck-clean status under real SwiftUI / Compose is not CI-verified.** `swiftc -parse` (Linux toolchain, no SwiftUI symbols) ≠ `swiftc -typecheck` (macOS, full framework). The "typecheck-clean on both platforms" headline claim depends on local PMTC harness runs + label-gated device CI; main-branch CI does not continuously verify it.
3. **Whether `_inGuard` re-entry actually prevents infinite loops in real SwiftUI/Compose navigation is unit-tested only.** The unit tests count guard-fire counts; whether SwiftUI's `NavigationStack(path:)` two-way binding under real device animation reproduces the same shape as the unit test's `MockRouter` is unverified.
4. **CLAUDE.md vs multiplatform.md primitive count disagreement** — Scout 4 found 16 vs 15. CLAUDE.md:263 says "16 semantic primitives" while multiplatform.md:3 status banner says "15-primitive canonical vocabulary." Audit could not determine which is correct without enumerating against `canonical-primitives.ts` line-by-line — flagged as PR-A8 doc-reconciliation work.
5. **Scout 2 reported the `${33}` hardcoded count drift in `PyreonRouterTest.kt:335`** — Scout 1 reported no contradiction, but Scout 2's claim that Kotlin runtime tests are NOT JUnit-discoverable AND Scout 1's claim that 50 XCTest cases exist on Swift agree on the asymmetry. The Kotlin test-infra gap is real and bigger than the Swift side.
6. **No scout reviewed published-package status.** Whether `@pyreon/native-runtime-swift`, `@pyreon/native-runtime-kotlin`, `@pyreon/native-router-swift`, `@pyreon/native-router-kotlin` are actually consumable via SwiftPM / Maven by an external user requires npm/registry inspection + a test consumer project. Audit covered repo-internal wiring only.

## Recommendation

**Realistic timeline to 100%: 4-5 months at current pace** (Phase A 4-5w + Phase B 6-8w + Phase C 3-4w + Phase D 6-8w; some Phase B/D overlap possible).

**What's already "good enough" for what:**
- Internal demos + technical-credibility content (conference talks, "Pyreon runs on iOS" blog posts): **YES, now.** Compiler emits typecheck-clean on both targets; TodoMVC works end-to-end on real devices; the one-source contract is structurally proven. The framework story is compelling.
- A motivated early-adopter team building a real app: **NOT YET.** Nested routes don't work (CRIT-2), per-route guards don't work (CRIT-3), `useLoaderData` silently drops (CRIT-4), no real-app showcase to crib from (CRIT-5), `parse.ts` has 20+ silent-drop paths that aren't documented (DX cliff). They'd hit footguns continuously.
- Public-launch "production-ready" claim: **NO** — at minimum need branch-protection covering native (CRIT-1) before that claim is honest; otherwise the next un-gated PR breaks the emit and ships to npm.

**Push to 100% NOW or stop short?** **Phase A is mandatory** (4-5 weeks). Without CRIT-1 + CRIT-2 + CRIT-3 + CRIT-4 closed, the "Pyreon goes multi-target" story is structurally broken at the user-facing-API level — a router that can't do nested routes is not a router. After Phase A, the framework is **honest 75-80/100** and could ship as "early preview, real apps work but expect rough edges." Phase B + C bring it to ~88/100 (production-credible). Phase D pushes to 95+/100 but is heavy work for diminishing returns; 80% of Phase D's value comes from the supported-TS-surface doc + the real-app showcase + asset pipeline (the other items are polish).

**Recommendation: commit to Phase A (4-5w) as an unconditional gate to any public native messaging. Decide on Phases B-D based on adoption signal post-A — if early adopters surface real-app pain, prioritize the specific Phase B/D items they hit; if not, the framework is honest at Phase-A-complete and additional investment can be deferred.**
