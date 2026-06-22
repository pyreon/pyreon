# RFC + Audit — Custom-Property Style Extraction (CPSE)

**Status:** engine + opt-in `cpseStyled` integration SHIPPED + proven (this PR). Default-pipeline migration staged (RFC §5).
**Date:** 2026-06-22.
**Scope:** framework-level — `@pyreon/unistyle` + `@pyreon/styler` + `@pyreon/rocketstyle` + `@pyreon/elements`. NOT app-specific.

## Implementation status (this PR)

**Shipped + proven + tested:**

- **Engine** — `styles()` `extractVars` mode + `cpseRewrite` / `extractStyleVar` / `cpseVarName` (`@pyreon/unistyle`). Post-processes `processDescriptor`'s already-resolved declarations into value-agnostic `prop:var(--u-<hash>)` + a `varName→value` sink, across `convert`/`edge`/`simple`/`convert_fallback` kinds; structural fragments (`{`/`@`/`&`/`url(`) pass through untouched. **Off-path byte-identical** (the existing `styles.test.ts` passes unchanged). Per-breakpoint var suffixing implemented + unit-tested.
- **Real-component integration** — `cpseStyled(tag)` (`@pyreon/unistyle`): a value-agnostic class cached by **property-set** (so N distinct values share ONE class + ONE `styler.resolve`) + per-instance inline custom properties. Proven in real Chromium: **O(N)→O(1)** (5 distinct values → 1 class / 1 resolve / 5 correct computed values), computed-style **parity** with classic `styled`, **nesting-safe**, **dynamic** signal updates with **zero** extra `styler.resolve`. Opt-in — **zero blast radius** on existing `styled`/`Element`/`rocketstyle`.
- **SSR parity** — `cpseStyled` emits the value-agnostic class + an inline `--`-custom-property style object (node-tested); the runtime-server `normalizeStyle` `--`-guard fix makes SSR serialize custom-property names verbatim (parity with the client `applyStyleProp` guard). Both bisect-verified.
- **e2e (real Chromium, SSR + hydration + dynamic)** — `examples/ssr-showcase/src/routes/cpse-probe.tsx` + 3 specs in `e2e/ssr-showcase.spec.ts`: SSR emits inline custom properties (NOT baked values) + a value-agnostic rule; N distinct values share ONE class each computing its own padding; a signal-driven box updates on click. **Bisect-verified-with-restore** (baking → 3/3 fail, restore → 3/3 pass).
- **Measured win-matrix** — `cpse-winmatrix.test.ts` asserts the numbers: high-cardinality (100 distinct values) → classic **100 rules / 100 resolves** vs CPSE **1 rule / 1 resolve**; uniform (one value ×N) → classic already shares one rule, CPSE adds per-instance inline bytes (the honest, asserted per-app trade-off — adoption is measured, not assumed universal).
- **Responsive values** (PR `feat/cpse-responsive`) — `cpseStyled` accepts mobile-first arrays + breakpoint objects. Each breakpoint emits a suffixed value-agnostic rule (`padding: var(--u-<hash>-sm)`) wrapped in its `@media` (via `createMediaQueries`; the styler's `splitAtRules` hoists the nesting), the instance sets every breakpoint's value inline, and the `@media` cascade selects the active var — keeping O(1) rules + the zero-resolve dynamic property. Breakpoints from `theme.breakpoints` / a default set / a `breakpoints` prop. Proven: unit (array/object expansion, shared class, custom breakpoints) + a real-Chromium **viewport-switch e2e** (400px→8px, 900px→48px), bisect-verified (no-`@media` → larger value wins everywhere).

**Deliberately NOT in this PR (staged — each a focused, correct effort; rushing into a critical styling path would violate the bar):**

- **`init({ styleExtraction })` flag + default-pipeline migration.** Auto-routing the existing `styled`/`Element`/`rocketstyle` defaults through CPSE means re-plumbing `doResolve` (the framework's single most-depended-on path). Investigated: Element's style props flow `Element → $element bundle → WrapperStyled (styled) → doResolve`, and the styler caches by value-bearing `$element` identity — so a `doResolve` integration yields **O(1) rules** (the bundle/bloat win) but keeps **O(N) resolve** (partial), with broad blast radius across the whole UI-system test surface + reactive-path var-surfacing complications. That is the per-phase, regression-gated rollout. Adding the flag now — with nothing reading it — would be the typed-but-unimplemented anti-pattern the `audit-types` gate forbids, so the flag ships WITH the migration.
_(Responsive values — previously staged — SHIPPED in `feat/cpse-responsive`; see the shipped list above.)_

## 0. Why this exists (and why it is NOT a bokisch.com fix)

A consumer (bokisch.com) reported `_rsCollapse: 0` — the compile-time rocketstyle-collapse pass matches zero call sites in their app. The reported diagnosis is correct (verified against source, §1) but the *framing* — "make collapse fire on this app" — is the wrong altitude. The real issue is a **framework-wide cost model**: rocketstyle/Element styling cost scales with the **cardinality of distinct style-value tuples** an app renders, and degrades further under **dynamic (signal-driven) style values** and **LRU eviction**. bokisch.com is simply the app whose shape (bespoke high-cardinality layouts) made the cost visible. Any app — a data table with per-row computed styles, a dashboard, a design system used at scale — hits the same wall on a different axis. **This RFC fixes the cost model, not the app.**

## 1. The cost model (verified from source)

### 1.1 How an arbitrary-value style prop becomes CSS today

`<Element gap={36}>` → unistyle `value(36)` → `"2.25rem"` ([units/value.ts:72](../../packages/ui-system/unistyle/src/units/index.ts) — `val / rootSize` rem) → embedded into the styler template string → `styler.resolve` ([styler/resolve.ts:83](../../packages/ui-system/styler/src/resolve.ts)) builds the final CSS text → hash → `sheet.insert` → a **unique CSS rule + className per unique resolved value**.

### 1.2 The cost is O(distinct value tuples), proven by an existing test

[`static-styler-resolve-cost.test.ts`](../../packages/ui-system/styler/src/__tests__/static-styler-resolve-cost.test.ts) is the framework's own measurement gate. It establishes, with the real `styler.resolve` counter:

- Fully-static CSS (`styled('div')\`color: red\``) → `styler.resolve === 0` (already optimal — `raw = strings[0]`, no resolve).
- **Value-dependent CSS → `styler.resolve === N`** (one per call), and the test documents this as *"genuinely per-call (CSS depends on props)… CORRECT, not waste"* and names the real fix: *"the remaining surface is purely compile-time / bundle … that is the roadmap item, deliberately NOT half-built here."* **This RFC is that roadmap item.**

### 1.3 Why the existing runtime caches do NOT solve it

`elClassCache` (`$element` interning), `classCache`, and `_rsMemo` make **repeated identical** tuples cheap (cache hit → resolve 0). They do **not** help the cases real apps actually live in:

- **First occurrence of each unique tuple** → resolve + a new CSS rule. An app with K distinct `(gap, padding, direction, align, …)` tuples ships K rules and pays K resolves.
- **`$element` interning bails on functions / non-string objects** → every **signal-driven** style value (data tables, animated layouts) resolves on **every render**.
- **LRU bound at 256** → an app with > 256 distinct tuples **thrashes**: evict → re-resolve.

So the win from fixing this **grows with app complexity and dynamism** — flat/small on a low-cardinality static design system (caches already cover it; the only win there is fewer stylesheet rules), large on high-cardinality bespoke layouts (bokisch), largest on dynamic per-instance values (tables/dashboards). This is the "scale across apps" property.

### 1.4 Why the complaint's "expand the bail catalogue" (path B) is the wrong primitive

Path B (accept number/boolean literals at the call site and **bake** the resolved template per site) **inherits the O(distinct-tuple) cost as bundle weight**: `_rsCollapse` bakes a template + 2 class strings + CSS rules **per unique `(component, prop-tuple, children)` key**. On a high-cardinality app it produces *more* baked artifacts than the shared runtime it replaces — a net regression on exactly the apps that need help. (It also can't express dynamic values, and "number → string-equivalent at compile time" is a correctness trap: `value()` treats `36`≠`"36"`.) Path B optimizes the *wrong dimension*. The fundamental move is to make CSS-rule identity **independent of the value**.

## 2. The fundamental fix — Custom-Property Style Extraction (CPSE)

> **Decouple CSS-rule identity from style-value identity.** A style prop's rule becomes value-agnostic — `property: var(--u-<key>)` — shared by every instance and every value; the *value* is delivered per-instance as an inline CSS custom property. Cost moves from **O(distinct value tuples)** to **O(component definitions)**.

### 2.1 Mechanism (every step verified reusable against shipped code)

| Today | CPSE |
|---|---|
| `gap={36}` → `value(36)` → `"2.25rem"` baked into the styler template | static rule `gap: var(--u-elGap)` (value-agnostic) + per-instance inline `style="--u-elGap: 2.25rem"` |
| `styler.resolve` per **unique value** | `styler.resolve` **once per component definition** (the rule text is value-independent → identical every time → cached by identity) |
| one CSS rule per **unique value** | **one shared rule** per (component, property-set) — flat regardless of value cardinality |
| dynamic value → bails intern → resolve every render | dynamic value → `renderEffect` updates the inline custom property — **no resolve, no new rule, no hash** |

Reuses shipped infrastructure, not new primitives:
- **`var()` passthrough is already a tested contract.** `value()`/`stripUnit` return any `var(...)`/`calc(...)` string untouched ([cssVariables.ts](../../packages/ui-system/unistyle/src/cssVariables.ts) + the passthrough test). So emitting `var(--u-elGap)` flows through the entire value→CSS pipeline unchanged.
- **The css-variables theming work is the precedent.** `init({ cssVariables: true })` already tokenizes the *theme* into `--px-*` custom properties + makes mode-flip O(1) (one attribute write, zero re-resolution). CPSE is the same mechanism applied one level down — to **per-instance style-prop values** instead of theme tokens. The dev-mode `sheet.insert` NaN/malformed-`var()` validator already exists and covers the new emission.
- **The inline-custom-property + SSR + hydration pattern is already proven** by the cssVariables `display:contents` provider work (SSR-renders the attribute, survives hydration).

### 2.2 Responsive + dynamic both fall out for free

- **Responsive arrays** (`gap={[8,16,24]}`): the static rule carries the media queries referencing **per-breakpoint** vars — `.el{gap:var(--u-elGap-xs)} @media(min-width:sm){.el{gap:var(--u-elGap-sm)}}` — and the instance sets each breakpoint's var inline. Still **one shared rule-set per component**; values parameterized. (Inline styles can't be media-scoped, but the *rule* can — the var indirection is what makes this work.)
- **Dynamic values** (`gap={() => store.gap()}`): a single `renderEffect` writes `el.style.setProperty('--u-elGap', value(store.gap()))`. No `styler.resolve`, no rule churn — the same fine-grained-update story Pyreon already tells for text/attributes, now for style values.

## 3. Per-app-shape win matrix (honest — measured in Phase 0)

| App shape | Today | CPSE | Win |
|---|---|---|---|
| **Low-cardinality design system** (few canonical shapes, static) | caches already → ~0 resolve; K rules (small K) | ~0 resolve; ~0 extra rules; per-instance inline bytes | **Small** — bundle (fewer rules) only; runtime already cheap |
| **High-cardinality bespoke** (bokisch — many distinct layout tuples, static) | O(K) resolve + O(K) rules + LRU thrash if K>256 | O(defs) resolve + O(defs) rules; flat | **Large** — the headline case |
| **Dynamic data-heavy** (tables/dashboards — signal-driven per-instance values) | resolve **every render** (intern bails) | inline custom-property update, **0 resolve** | **Largest** — and currently unaddressed by any cache |

The honest headline is **not** "universal speedup." It is: *CPSE makes styling cost flat in app cardinality and dynamism — biggest exactly where the runtime caches are weakest (high cardinality, dynamic values), modest (bundle-only) where they already win.* Phase 0 quantifies each cell rather than asserting it.

## 4. Relationship to existing work (this supersedes / composes, does not duplicate)

- **`_rsCollapse` (per-call-site bake)** — CPSE is the general primitive; `_rsCollapse` becomes a special case (a component whose *structure* is also static can additionally skip the wrapper mount). Where CPSE covers the styling, `_rsCollapse`'s remaining job is purely the wrapper-tree elision. They compose; CPSE removes `_rsCollapse`'s bloat-on-high-cardinality failure mode by handling the value layer via vars instead of baking.
- **css-variables theme tokens** — same mechanism, theme-token layer. CPSE extends it to the style-prop layer. Shared infra (validator, passthrough contract, `value()` conversion).
- **`_rsMemo` / `elClassCache` / `classCache`** — these stay; they cover the **finite-dimension** layer (state/size/variant) which is bounded-domain and already well-served. CPSE targets the **arbitrary-value** layer they can't (first-resolve, dynamic, LRU thrash). End state: a rocketstyle component's full styling = finite dims → memoized class (existing) + arbitrary props → custom properties (CPSE). `styler.resolve` + `rocketstyle.getTheme` → ~0 for the common case, **static AND dynamic, no bloat**.

## 5. Phasing

- **Phase 0 (this PR — de-risk):** (a) measurement harness across the 3 app shapes in §3 proving cost is O(distinct tuples) today; (b) CPSE PoC on **one** style prop end-to-end proving `styler.resolve → 0` for the style-prop layer, **one shared rule for N distinct values**, dynamic-value updates with no resolve — real-Chromium + bisect-verified. *Prove the fundamental before committing the framework.*
- **Phase 1:** generalize across the unistyle style-prop set (170+ mappings) behind `init({ styleExtraction: true })` (flag-gated like cssVariables; byte-identical off). Responsive via per-breakpoint vars.
- **Phase 2:** dynamic-value path (signal-driven props → custom-property `renderEffect`) + wire the existing dev validator.
- **Phase 3:** rocketstyle integration — compose CPSE (arbitrary props) with `_rsMemo`/collapse (finite dims). Target `styler.resolve`+`rocketstyle.getTheme` ~0 common case.
- **Phase 4:** SSR/hydration parity (inline custom properties SSR-render + hydrate — reuse cssVariables proof), doc-export resolution (`resolveCssVarReferences`), bundle-budget + retained-heap measurement per app shape, `_rsCollapse` composition.

## 6. Risks / honest caveats (each measured, not assumed)

1. **Inline-style bytes vs stylesheet-rule bytes.** CPSE moves value bytes from shared rules to per-instance `style`. Net favorable on high cardinality (rules shared); could be **neutral or negative on low cardinality** (rules were already shared, now you add inline vars). MEASURE per shape; this is why CPSE is a flag, not a default.
2. **Custom-property inheritance / scope collision.** Custom properties inherit down the cascade — a parent `<Element>`'s `--u-elGap` must not leak into a nested `<Element>`. Var names must be unique per (component-definition, property) — hashed, not generic. The cssVariables mode work hit and solved the same nested-scope problem; reuse that discipline. **Correctness-critical; covered by a real-Chromium nesting test in Phase 0.**
3. **Composite / calc values** (`padding: ${a} ${b}`, `calc(...)`). Multi-token props need careful var decomposition. Exotic shapes that don't cleanly parameterize → keep per-value resolve as a documented conservative fallback (same philosophy as the collapse bail catalogue: correct-but-slow beats wrong).
4. **SSR HTML growth** — per-instance inline custom properties enlarge SSR output. Measure against the rule-bytes saved; the css-variables work shows the pattern is SSR-safe, the question is only the byte trade (shape-dependent).
5. **Specificity parity** — `property: var(--x)` rule must match today's specificity so cascade order is unchanged. Verified by computed-style equality in the PoC.

## 7. Verification strategy

- **Phase 0 gates (this PR):** the cross-shape cost harness (counter-based, deterministic) + the PoC's real-Chromium computed-style equality + `styler.resolve → 0` + one-rule-for-N-values + dynamic-update-no-resolve, all bisect-verified.
- **Per phase:** bisect-verified regression tests; `verify-modes` cell + real-Chromium e2e where rendered output changes; bundle-budget + retained-heap deltas per app shape; flag-off byte-identical proof (the cssVariables precedent).
- **The discriminating measurement** (the one that proves the fundamental): render **N distinct values** of one prop and assert **rule count is 1** (CPSE) vs **N** (today), with `styler.resolve` flat. That single contrast is the whole thesis.
