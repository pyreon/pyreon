# Code Style Rules

## Linting & Formatting

- **oxlint** for general JS/TS linting (400+ rules, Rust-powered)
- **oxfmt** for formatting (Rust-powered, Prettier-compatible)
- **@pyreon/lint** for Pyreon-specific rules (62 rules, 12 categories)
- Config files: `.oxlintrc.json` (linting), `.oxfmtrc.json` (formatting), `.pyreonlintrc.json` (Pyreon-specific rules)
- Run lint: `bun run lint` (runs `oxlint .` from root)
- Run format: `bun run format` (runs `oxfmt --write .`)
- Check format: `bun run format:check` (runs `oxfmt --check .`)
- Inline suppression: `// oxlint-disable-next-line rule-name` (not `biome-ignore`)
- **oxlint plugin set is CURATED, not wholesale — do NOT enable categories or plugins blindly.** Enabled plugins: `typescript`, `unicorn`, `oxc`, `import`, `jsx-a11y`, `promise`, `node`, `vitest`. Only the **`correctness`** category is on; valuable rules from other categories are cherry-picked individually (`oxc/no-accumulating-spread`, `oxc/no-map-spread` — real O(n²)/spread perf). **Measured fact:** enabling `pedantic` + `jsdoc` wholesale produces **~19,600 findings**, ~99% noise that fights this codebase's deliberate conventions — `no-underscore-dangle` (1,890; Pyreon's `_v`/`_d`/`_s` internals are intentional), `jsdoc/require-param`+`require-returns` (3,400; JSDoc is selective by design), `consistent-function-scoping` (1,065). Even `suspicious`/`perf` wholesale = ~5,300. So: **never enable `pedantic` / `jsdoc` / `suspicious` / `perf` / `restriction` / `nursery` as categories** — cherry-pick the few good rules to `warn`. **Skipped plugins (deliberate):** `react` / `react-perf` (Pyreon components run ONCE — React's re-render-perf rules are semantically wrong here), `nextjs` (not Next), `jest` (repo uses vitest). **Per-rule floods turned off** with rationale: `jsx-a11y/label-has-associated-control` + `control-has-associated-label` (FP-prone; label-association needs cross-element id/scope resolution an AST walker can't do — the documented "high-risk cliff"), `vitest/expect-expect` + `require-mock-type-parameters` + `no-conditional-expect` + `require-to-throw-message` (`expect-expect` mostly FP against the repo's custom assertion helpers). `@pyreon/flow` + `@pyreon/code` are scoped-exempt from the jsx-a11y interactivity rules (`prefer-tag-over-role`, `no-static-element-interactions`, `click-events-have-key-events`, …) — a canvas/diagram + code-editor lib legitimately puts `role`/`onClick` on non-semantic elements. All these fire at `warn` (advisory) — `oxlint .` exits 0 on warnings, so they surface real a11y/perf/async/test signal without gating CI; promote a specific rule to `error` only after driving its findings to zero.
- **oxlint severity is a THREE-STATE model — every rule's state is a deliberate, documented choice; there is no "undecided `warn`".** The governing principle for raising codebase quality through lint:
  - **`error`** = quality is *protected* here. Findings **must be 0**; `oxlint .` exits non-zero, so the `Lint` CI job gates it. This is the only state that prevents regressions.
  - **`warn`** = a *burn-down lane*, not a parking lot. A rule sits here only while its findings are being driven to zero (or because it's an accepted-visible signal with a stated reason). A rule parked at `warn` forever with no intent is the worst state — noise **and** no protection.
  - **`off`** = deliberately N/A, with a one-line rationale (Pyreon convention, FP-prone, or wrong semantics for this codebase).
  The promotion unit is **atomic fix-and-gate per rule**: one PR triages a rule's findings (fix real bugs, scope-`off` intentional-in-context, fix-via-config when the rule is mis-set for vitest/etc.), drives it to **zero**, then flips it to `error` in the SAME change. Never leave a rule half-fixed at `warn` — that invites refill. **Before promoting**, run `bunx oxlint .` and confirm the rule shows 0 findings (a promoted rule with a surviving finding breaks CI for everyone).
- **Error-gated correctness tier (live).** Promoted to `error` (findings driven to 0): `oxc/no-accumulating-spread` (real O(n²) — fixed in rocketstyle by mutate-accumulator), `no-unsafe-finally`, `no-unsafe-optional-chaining` (`(x?.y as T)?.z`), `no-control-regex`, `no-unused-expressions`, `unicorn/no-thenable`, `vitest/valid-expect` (set `maxArgs: 2` — vitest's `expect(actual, message)` is valid; do NOT delete the authors' failure-diagnostic messages), `vitest/no-standalone-expect`. Companion scope-`off`s: `no-unused-expressions` off for `**/*.bench.ts` + `scripts/bench/**` (the bare expression IS the measured work), `unicorn/no-thenable` off for `packages/native/compiler/src/**` (the IR uses `then` as the if/ternary branch field — not a promise). **Remaining `warn` backlog** (burn-down candidates, fix-and-promote next): `oxc/no-map-spread` (18), `import/no-duplicates`, `unicorn/no-new-array`, `promise/no-callback-in-promise`, the jsx-a11y interactivity set. **Two big policy rules** are a separate decision (not bugs): `typescript/no-non-null-assertion` (~296 — `!` is a deliberate TS escape-hatch in this codebase; accept-and-`off`-in-lib OR commit to the `if (!x) return` style) and `no-console` (~115 after overrides — split `off` in scripts/CLI/examples, `error` in shipped `packages/*/src`).
- **Pyreon-lint rule options.** Config entries accept a bare severity (`"error"`) or a `[severity, options]` tuple. Rules that support path-based exemption read `options.exemptPaths: string[]` — each entry is a substring match against the file path. The monorepo's `.pyreonlintrc.json` at repo root configures exemptions for DOM-runtime / server-only / cleanup-wrapper-foundation packages (e.g. `packages/core/runtime-dom/` is exempt from `no-window-in-ssr`). **Do NOT hardcode monorepo-specific paths in rule source** — they ship to user apps as dead code at best, leaked internals at worst. Use the `exemptPaths` option instead.

## TypeScript

- `exactOptionalPropertyTypes` enabled — optional properties need explicit `| undefined`
- `jsx: "preserve"` with `jsxImportSource: "@pyreon/core"` in root tsconfig
- `customConditions: ["bun"]` in root tsconfig for workspace resolution
- No build step needed for development — `"bun": "./src/index.ts"` in each package's exports

## Conventions

- Prefer `signal<T>()` callable pattern (not `.value` getter/setter)
- Components are plain functions: `ComponentFn<P> = (props: P) => VNodeChild`
- `onMount` returns `CleanupFn | undefined` (not `void`)
- Use `h()` or JSX — both produce VNodes
- `<For>` uses `by` prop (not `key`) because JSX extracts `key` specially
- Context: `provide(ctx, value)` — pushes context and auto-cleans up on unmount
- `ExtractProps<T>` extracts props from a ComponentFn or passes through
- `HigherOrderComponent<HOP, P>` for typed HOC patterns

## UI Components (@pyreon/ui-components)

- **Layout in `.attrs()`, CSS in `.theme()`**: Element layout props (`direction`, `alignX`, `alignY`, `gap`, `block`, `tag`) go in `.attrs()`. Visual styles (colors, spacing, borders, shadows) go in `.theme()`.
- **Pseudo-state styles**: Use `hover: { ... }`, `focus: { ... }`, `active: { ... }`, `disabled: { ... }` objects inside `.theme()` callbacks. The `el`/`txt` bases handle CSS pseudo-selector generation via `makeItResponsive`.
- **Hover CSS is unconditional**: `:hover` styles apply to ALL components that define hover theme — not just interactive ones (onClick/href). The `cursor: pointer` is the only thing gated on interactivity.
- **CSS property naming**: Use unistyle convention (`borderWidthTop`, `borderColorLeft`) NOT CSS-spec order (`borderTopWidth`, `borderLeftColor`). Property-first naming.
- **useBooleans: false**: Rocketstyle dimensions accept string values (`state="primary"`, `size="large"`), not booleans. This is the default.
- **Size dimensions should be comfortable**: Menu items, dropdown options, and interactive list items need adequate padding. `t.spacing.small` (8px) vertical / `t.spacing.medium` (12px) horizontal is the minimum for touch-friendly sizing.
- **Use `@pyreon/hooks` instead of manual event handling**: Use `useEventListener` for document/window listeners, `useScrollLock` for scroll locking, `useClickOutside` for click-outside detection. Never use raw `addEventListener`/`removeEventListener` in primitives.
- **Use `@pyreon/elements` Overlay for tooltips/popovers/dropdowns**: The `useOverlay` hook handles positioning, viewport flipping, ESC key, click-outside, scroll tracking, hover delay. Never reimplement overlay positioning logic in primitives.
- **Semantic HTML in `.config({ component })`**: Use `component: 'hr'` for Divider, `component: 'nav'` for nav containers etc. This sets the outer rocketstyle element tag. `tag` in `.attrs()` sets the Element's inner tag.

## UI Primitives (@pyreon/ui-primitives)

- **Use `useControllableState`**: Every primitive with controlled/uncontrolled state must use `useControllableState({ value, defaultValue, onChange })` from `@pyreon/hooks`. Never duplicate the `isControlled + signal + getter` pattern.
- **Shared keyboard navigation**: Use `navigateByRole()` from `keyboard.ts` for arrow key navigation between siblings (tabs, radios). Accepts `containerSelector`, `itemSelector`, and `keys` ('horizontal'|'vertical'|'both').
- **Render-function primitives provide ARIA helpers**: ComboboxBase exposes `inputProps()`, `listboxProps()`, `getOptionProps()`. TreeBase exposes `treeProps()`, `getItemProps()`. FileUploadBase exposes `inputProps`. Always add ARIA helper objects to state for render-function primitives.
- **Reactive conditional rendering**: Use `return (() => { if (!cond()) return null; return <div>...</div> })` not `if (!cond()) return null; return <div>...</div>`. Components run once.
- **No `as unknown as VNodeChild`**: JSX.Element (VNode) is assignable to VNodeChild. The cast is unnecessary.

## Dead Code

- Remove dead code rather than commenting it out
- If browser APIs are removed from spec, remove the code that uses them
- Don't add backwards-compatibility shims for removed features
