# RFC: Compile-time wrapper-collapse for rocketstyle (option C)

**Status:** Draft — for review.
**Lineage:** Follows E2 (PR #338, GRADUATE) and the audit/probe in PRs #340 and #342. Implements `architectural-experiments-2026-q2.md § E2` follow-up.
**Estimated effort:** 4–6 weeks for a focused, feature-flagged implementation. Ship behind opt-in config; no behavior change for apps that don't enable it.

## TL;DR

E2 measured a 44× wall-clock speedup when a rocketstyle Button mount is replaced by a `_tpl()` cloneNode of its pre-resolved class string (real Chromium, 200 mounts × 5 runs). The audit (`A-AUDIT.md`) showed 95.3% of rocketstyle call sites in `examples/` are statically resolvable. The probe (`B-FINDING.md`) confirmed every call still pays for 22 styler.resolve calls even when the styler-sheet cache catches the result.

This RFC proposes a `@pyreon/compiler` pass that detects literal-prop rocketstyle call sites at build time, runs the dimension/theme resolution chain in the compiler, and emits a `_tpl()` call with the resolved class string baked in. Non-collapsible call sites fall through to the existing rocketstyle runtime path, unchanged.

The pass is **opt-in via config** and **conservative-by-default**: any uncertainty → fall through.

## Why this is shipping-shaped, not experiment-shaped

E2 already validated the hypothesis. The remaining work is engineering: build the pass without breaking the long tail of rocketstyle features (custom dimensions, per-instance themes, `.attrs()` callbacks reading props, pseudo-state CSS, theme switching, source maps).

The risks are not "will it work" — they are "what's the precise bail-out boundary, and how do we make 'fall through to runtime' the safe default for every edge case the compiler doesn't fully understand."

## Problem

Each rocketstyle component mount costs:

- 22 `styler.resolve` calls (~1.8µs each → ~40µs aggregate)
- 21 `unistyle.descriptor` evaluations
- 5 `unistyle.styles` calls
- 1 `rocketstyle.getTheme` (full theme merge across all dimensions)
- 9 `mountChild` operations (vs. 1 for a hand-written `<button>`)

Per E2 RESULTS.md (corrected math in PR #341): **44µs per mount, ~1.8ms per 200 buttons in the rocketstyle path alone**. For a real-app boot with 50–100 visible rocketstyle components plus their wrapper amplification (~30–50× via Element/styled/rocketstyle layers), this adds up to a meaningful fraction of TTI.

The B probe (PR #342) showed the styler-sheet cache catches duplicate inserts at the **last step** — every mount runs the full pipeline JUST to compute the cache key. Caching at insert time isn't enough.

Two solutions compound:
- **B (runtime memo, separate PR):** hash the dimension-prop tuple at the rocketstyle wrapper, cache the class string per `(theme, propTuple)`. ~5× speedup on the runtime path. Helps dynamic-prop and theme-swap cases that this RFC's compiler pass can't reach.
- **C (this RFC, build-time):** resolve literal-prop sites at compile time, emit `_tpl()` directly. ~44× speedup on the resolved sites. Zero runtime cost on collapsed call sites.

Both should ship; they don't conflict.

## Proposal

Add a new pass to `@pyreon/compiler` that runs **after** the existing JSX → reactive transform completes:

1. Walk the post-JSX AST for `h(Component, props, …)` and surviving `<Component … />` nodes.
2. If `Component` resolves to a module-scope identifier with `IS_ROCKETSTYLE === true` AND every dimension prop value is a static literal AND no `theme={…}` override prop is present AND no `.attrs()` chain on the component reads from runtime props — proceed to step 3. Otherwise, leave the call unchanged.
3. Run the rocketstyle dimension/theme/styles pipeline against a build-time theme object (resolved per the config story below). Produce a class string + a list of CSS rules to inject into the styler sheet.
4. Replace the call with a `_tpl('<button class="…">…</button>', root => { … })` invocation. Inject the CSS rules at module-init time via a generated `_injectStaticRules([…])` call so the styler sheet is populated before any cloneNode runs.
5. For non-collapsible sites: emit the existing `h(Component, props, …)` unchanged. Existing rocketstyle runtime path handles them.

### What "collapse" emits

Conceptually, a call site like:

```tsx
<Button state="primary" size="large">Save</Button>
```

becomes (post-pass):

```js
_injectStaticRules(_$rules_42)  // module-init, deduped
const _$tpl_42 = _tpl('<button class="pyr-38xe3m pyr-186j8ah"></button>', (root) => {
  root.textContent = 'Save'
  return null
})
// at the call site:
_$tpl_42()
```

`_$rules_42` and `_$tpl_42` are hoisted to module scope. Identical resolved class strings dedupe at compile time so identical Buttons share one `_tpl()`. Children that are themselves dynamic (signals, expressions) keep their `_bind()` wiring — collapse only flattens the rocketstyle/styled/Element wrapper chain, not the user's reactive content.

## Detailed design

### Pass placement

The Pyreon compiler is a dual-backend system: a Rust native binary (~3.7–8.9× faster) with a JS fallback path. The RFC keeps this pass **JS-only initially**, called as a post-step after both backends complete their JSX walks. Native delivers the post-JSX AST (already parsed and transformed); the JS pass walks it and rewrites the rocketstyle call sites.

This avoids forcing a Rust port of the rocketstyle theme-resolution logic (which itself imports from `@pyreon/styler` and `@pyreon/unistyle`). It costs a measurable but bounded overhead per file — only files containing rocketstyle components incur the cost, and the pass is gated behind config.

A native-Rust port can come later if the JS pass becomes a build-time bottleneck (unlikely for now — the rocketstyle work is per-call-site, not per-token).

### Detection criteria (all four must hold to collapse)

1. **Component identity is static.** `<Button …>` resolves through module imports to a value with `IS_ROCKETSTYLE === true`. Dynamic component refs (`<Comp …>` where `Comp` is a parameter) bail.
2. **All dimension props are static literals.** For every key in `Component.options.dimensionKeys`, either the prop is absent (use default) or its value is a string/number/boolean literal. Any expression — signals, conditionals, ternaries, `props.X` reads, function calls — bails. Reuse the existing `isStatic()` helper in `compiler/src/jsx.ts:1406`.
3. **No `theme={…}` prop.** Per-instance theme overrides require runtime resolution. Bail.
4. **No `.attrs()` callback chain on the component reads runtime props.** Conservative: bail if ANY `.attrs(callback)` is registered on the component definition. (Most rocketstyle components in `@pyreon/ui-components` use only static `.attrs({…})` object form, which is fine. The callback form is the risk.) The compiler can either (a) check the component's `__rs_attrs` chain (added in PR #321 for the document-primitives fast path) and bail if any entry is a function, or (b) require components opt in via a `__rs_collapsible: true` brand to indicate "no callback `.attrs()`". Decision: start with (a) — bail-on-callback. Apps that want collapse on a callback-using component can refactor to the object form.

If any of the four fail, emit unchanged and let the runtime path handle it. **Bail-by-default is the safety contract** — a missed optimization is acceptable; an incorrect collapse is not.

### Build-time theme story (load-bearing decision)

The compiler does not see runtime context. `<PyreonUI theme={theme} mode="light">` resolves at app boot, not at build. We need a deterministic build-time answer to "which theme + mode produce the class string we bake in."

Three options, pick one — recommend **Option A**:

- **Option A (recommended): config file.** Apps that want collapse must export a build-time theme:
  ```ts
  // pyreon.config.ts
  import { theme } from '@app/theme'
  export default {
    rocketstyleCollapse: {
      theme,
      mode: 'light',  // or 'dark', or both — see below
    },
  }
  ```
  The Vite plugin reads this in `configResolved` and passes it to the compiler via `transformJSX({ rocketstyleCollapse: { theme, mode } })`. Apps that omit the config get zero collapse — pure runtime path, no behavior change.
- **Option B: vite plugin option.** Same idea, in `vite.config.ts`. Cleaner for monorepos with one source of truth, but harder to share between Vite/Vitest/Storybook configs.
- **Option C: skip subtrees with dynamic theme.** Detect `<PyreonUI theme={signal()}>` at compile time and disable collapse for everything under that subtree. Rejected as primary because it can't cross module boundaries (the JSX tree the compiler sees is one component at a time; detecting "is this rendered inside a dynamic-theme PyreonUI" requires whole-app analysis).

**Light + dark dual emit.** If apps support both modes (most do), the pass should emit BOTH class strings and switch via a runtime mode signal:

```js
const _$tpl_42_light = _tpl('<button class="pyr-light-X">…</button>', …)
const _$tpl_42_dark = _tpl('<button class="pyr-dark-X">…</button>', …)
const _$tpl_42 = () => (currentMode() === 'dark' ? _$tpl_42_dark() : _$tpl_42_light())
```

Cost: 2× class strings + 1× tiny mode-branch wrapper. Still vastly cheaper than 22 resolves. The branch is a function call + signal read (~0.5µs) — well under the 40µs we saved.

### Resolving the class string at build time

The build-time theme resolution mirrors the runtime path (`packages/ui-system/rocketstyle/src/utils/theme.ts:122–163`):

1. Apply `.theme()` chained callbacks against the configured base theme to produce per-dimension theme slices.
2. For the literal prop values at this call site, run `calculateStylingAttrs` (`utils/attrs.ts:77–134`) to pick the matching dimension theme entries.
3. Run `getTheme()` to merge them into a final `computedRocketstyle` object.
4. Run the styled-component CSS template against `computedRocketstyle` to produce the CSS string.
5. Hash the CSS via the same FNV-1a algorithm `@pyreon/styler` uses at runtime, producing identical class names.
6. Collect CSS rules into `_$rules_N` arrays (deduped across collapses in the same module).

The compiler imports from `@pyreon/styler`, `@pyreon/unistyle`, `@pyreon/rocketstyle` directly — they run in Node at build time, which is fine because these packages are environment-agnostic (no DOM access in their resolution paths; the DOM injection happens at `_injectStaticRules` in the browser). The compiler must NOT execute user component bodies — only the dimension theme chain (which is data, not DOM-touching code).

### `_injectStaticRules` runtime helper

A new export from `@pyreon/runtime-dom`:

```ts
export function _injectStaticRules(rules: readonly string[]): void {
  if (rules.__injected) return
  for (const rule of rules) styleSheet.insertOnce(rule)
  rules.__injected = true
}
```

Idempotent (so multiple modules sharing the same rule arrays don't double-insert), batched (insertOnce dedups by hash), and called at module-init for every collapsed module. The styler-sheet `insertOnce` dedup via FNV-1a hash is already in place.

### Pseudo-state CSS

Pseudo-state styles (`hover`, `focus`, `active`, `disabled` in the rocketstyle theme) compile into the same CSS class string at runtime — they're emitted as `:hover`/`:focus-visible`/etc. selectors on the resolved class. The build-time pass uses the same mechanism, so collapsed sites get pseudo-state styling for free.

This was confirmed in E2's "secondary findings": collapsed Buttons have working hover/focus/active because the styler sheet includes those rules and the cloneNode reuses them.

### Children handling

Children that are static text or static JSX inline into the `_tpl` template literal as HTML. Children that are dynamic (signals, expressions, components) get `_bind()` calls, identical to the existing JSX → `_tpl` lowering. The collapse only flattens the rocketstyle wrapper chain — it doesn't alter the user's reactive content shape.

### `runtime.tpl` counter

Already instrumented (counter added 2026-Q2). On a collapsed site, mount emits `runtime.tpl: 1` and `runtime.mountChild: 1` instead of `runtime.mountChild: 9`. The perf-dashboard journey + `bun run perf:diff` will surface real-app-shape gains automatically once collapse is enabled.

## Bail-out conditions

Conservative: any of these → emit unchanged.

| Condition | Reason |
|---|---|
| Component is not `IS_ROCKETSTYLE` | Not a rocketstyle component |
| Any dimension prop is a non-literal expression | Dynamic — runtime resolves |
| `theme={…}` prop present | Per-instance override needs runtime |
| Component has any `.attrs(callback)` (function form) | Callback may read runtime props |
| Component has unknown custom dimensions not declared in config | Compiler can't resolve them |
| Component is rendered inside a dynamic-theme `<PyreonUI theme={signal()}>` subtree, AND the compiler can prove it | Theme override may diverge from build-time theme |
| `pyreon.config.ts` doesn't export `rocketstyleCollapse` | Opt-in only |
| Mode is dynamic AND compiler can't statically determine which `<PyreonUI mode>` wraps this site | Light+dark dual-emit covers static cases; bail when mode is signal-driven |

The list is intentionally long. **The win comes from the 95% of sites that pass all checks**, not from squeezing the last 5%.

## Engineering breakdown

| Phase | Scope | Estimate |
|---|---|---|
| 1. Config & detection | `pyreon.config.ts` schema, Vite plugin wiring, `IS_ROCKETSTYLE` + literal-prop detector, all bail-out conditions | 1 week |
| 2. Build-time resolution | Run rocketstyle theme/dimension chain in compiler, produce class string + CSS rules. Reuse `@pyreon/styler` FNV-1a hash | 1 week |
| 3. Emission | `_tpl()` rewrite, `_injectStaticRules` helper, dedup across module, light+dark dual-emit | 1 week |
| 4. Tests + parity | Browser smoke tests asserting collapsed sites render identically to runtime path. Audit the `examples/ui-showcase` build output | 1 week |
| 5. Examples + opt-in docs | One real example (`examples/ui-showcase`) with collapse enabled, performance comparison numbers | 0.5 week |
| 6. Soak + ship | Behind config flag in 0.x release, gather real-app feedback, address surprises | 0.5–1 week |

Total: **4–6 weeks**.

## Risks

- **Source maps.** Collapsed sites lose the original component name in dev tooling. Mitigation: preserve the JSX source location in a `// @rs-collapse` comment on the emitted `_tpl()`. Vite source-map pipeline forwards line/column.
- **Build-time theme drift.** If app authors update `pyreon.config.ts` without rebuilding, prod ships stale class names. Mitigation: include the theme hash in the rule-array variable name; if hashes differ between build and runtime PyreonUI, bail to runtime path with a dev-mode warning.
- **Custom dimensions.** Apps extending rocketstyle via `.statics({})` need to register custom dimension names in config. Otherwise compiler misses them and emits with the default subset. Mitigation: doc-only; the bail-out condition above catches it for the typical case (custom dimension prop = unknown literal → still resolves correctly because static-literal check passes; custom dimension theme is part of the component definition the compiler reads).
- **Component definition not statically discoverable.** `const Button = rocketstyle('button').…` works; `import { Button } from './buttons'` requires the compiler to resolve the import. Vite already builds an import graph — the compiler can ride on that resolver.
- **`@pyreon/ui-components` shipping pre-compiled.** When `@pyreon/ui-components` is consumed from npm (already-built), the rocketstyle definitions are inside the package's published JS, not user source. The compiler must read those definitions to know dimension keys and theme chains. Two options: (a) ship a JSON sidecar (`button.rs.json`) with the dimension manifest per component; (b) have the compiler dynamically `import()` the published module at build time and introspect via `IS_ROCKETSTYLE` brand. Lean toward (b) — it's how the runtime works today and adds no new format.
- **First-run cost.** The compiler now does more per file. Mitigation: cache the build-time resolution result keyed on `(component identity, prop tuple, theme hash, mode)`. Real apps have ~100 unique call-site shapes — cached after first resolution.

## Sequencing

1. **B (runtime memo) ships first**, because it's smaller (~1–2 weeks) and benefits dynamic-prop / theme-swap sites that this RFC can't touch. Independent perf win.
2. **C (this RFC) ships second**, after review. Gated behind opt-in config; no behavior change for apps that don't enable it.
3. **Both compound** — collapsed sites get 44× from C; runtime-resolved sites (dynamic, theme-swap, signal-driven) get 5× from B. Worst-case any rocketstyle path is faster than today.

## Open questions for review

1. **Light + dark dual-emit vs single-emit?** Dual-emit is ~2× class names but covers theme switching transparently. Single-emit (per-config mode) is smaller bundles but breaks `mode="system"` theme-switching apps. Recommend dual-emit; would like reviewer pushback if there's a third option.
2. **Sidecar manifest vs runtime introspection** for pre-built `@pyreon/ui-components`? Recommend runtime introspection (already how the framework works); reviewers may prefer the sidecar for build determinism.
3. **`__rs_collapsible: true` opt-in brand on components?** Forces app-author intent but adds friction to existing components. Recommend bail-on-callback (item 4 in detection criteria) instead — same safety, less friction.
4. **Per-instance `_$tpl_42()` factory call vs inline cloneNode?** Both work; the factory call is one extra function call (~0.05µs) but enables future shared-template caching across modules. Recommend factory shape.

## Out of scope

- Collapsing components inside dynamic-theme `<PyreonUI>` subtrees (always bail).
- Server-side rendering output — SSR already inlines styles via `renderToString`; the compiler pass is only for browser bundles. Hydration must match the SSR-emitted class string, which it does because both run the same resolution against the same theme.
- Auto-detecting which apps benefit. Apps must opt in via `pyreon.config.ts`. We don't know enough yet to enable by default.
- `@pyreon/elements` / `@pyreon/styler` standalone collapse — the RFC is rocketstyle-specific. Element/styled have a fast path (Element simple-path landed 2026-Q2, 31–45% faster), and a separate experiment can evaluate compiler collapse for them.

## Acceptance criteria

- Collapsed call sites pass `runtime.tpl >= 1, runtime.mountChild == 1` per Button.
- Build-time-resolved class strings match runtime-resolved class strings byte-for-byte (parity test in `examples/experiments/e2-static-rocketstyle/`).
- `bun run --filter=examples/ui-showcase build && bun run --filter=examples/ui-showcase preview` shows the same DOM output with-and-without `rocketstyleCollapse` config.
- `bun run perf:record --app perf-dashboard --journey dashboard` shows ≥30% wall-clock improvement on the rocketstyle journey with collapse enabled.
- All existing tests pass with collapse enabled (regression-free).

## Decision

Recommend going forward, sequenced after option B, behind opt-in config, with the 4–6 week scope above. The 95% audit + the 44× E2 measurement + the parallel-and-compounding nature with B mean this is the highest-yield framework perf project currently shaped.
