# Code Style Rules

## Linting & Formatting

- **oxlint** for general JS/TS linting (400+ rules, Rust-powered)
- **oxfmt** for formatting (Rust-powered, Prettier-compatible)
- **@pyreon/lint** for Pyreon-specific rules (132 rules, 25 categories — the gated count lives in AGENTS.md's package table; keep the two in sync)
- Config files: `.oxlintrc.json` (linting), `.oxfmtrc.json` (formatting), `.pyreonlintrc.json` (Pyreon-specific rules)
- Commands: `bun run lint` (`oxlint .`), `bun run format` (`oxfmt --write .`), `bun run format:check` (`oxfmt --check .`)
- Inline suppression: `// oxlint-disable-next-line rule-name` (not `biome-ignore`)

### oxlint configuration

- The plugin set is curated. Enabled plugins: `typescript`, `unicorn`, `oxc`, `import`, `jsx-a11y`, `promise`, `node`, `vitest`. Only the `correctness` category is on; rules from other categories are cherry-picked one at a time.
- Never enable `pedantic`, `jsdoc`, `suspicious`, `perf`, `restriction` or `nursery` as categories. Enabling `pedantic` + `jsdoc` alone produces ~19,600 findings, almost all fighting deliberate conventions (`_v`/`_d`/`_s` internals, selective JSDoc).
- Skipped plugins: `react`/`react-perf` (Pyreon components run once, so re-render rules do not apply), `nextjs`, `jest` (the repo uses vitest).
- `@pyreon/flow` and `@pyreon/code` are exempt from the jsx-a11y interactivity rules: a canvas/diagram and a code editor legitimately put `role`/`onClick` on non-semantic elements.

### Three-state severity

Every rule's state is a deliberate choice:

- `error` — gated at 0 findings by the `Lint` CI job. The only state that prevents regressions.
- `warn` — a burn-down lane, ratcheted so it can only shrink. Never park a rule here without intent.
- `off` — not applicable here, with a one-line rationale.

Promote one rule at a time: fix its findings, scope-`off` the intentional ones, drive it to zero, and flip it to `error` in the same change. Run `bunx oxlint .` first and confirm 0 findings for that rule.

The backlog is at zero: `oxlint .` reports 0 warnings and 0 errors, and `lint-baseline.json` has `total: 0`. Do not flip `off` rules back on without re-reading their findings.

- **Error-gated:** `oxc/no-accumulating-spread`, `no-unsafe-finally`, `no-unsafe-optional-chaining`, `no-control-regex`, `no-unused-expressions`, `no-unused-vars`, `no-useless-escape`, `no-shadow`, `import/no-duplicates`, `unicorn/no-thenable`, `unicorn/prefer-string-starts-ends-with`, `unicorn/no-useless-length-check`, `unicorn/no-useless-fallback-in-spread`, `jsx-a11y/no-redundant-roles`, `vitest/valid-expect` (`maxArgs: 2` — `expect(actual, message)` is valid; keep the authors' failure messages), `vitest/no-standalone-expect`, `no-console` (`allow: ["warn", "error"]`), `no-debugger`.
- **Off because they flag correct code here:**
  - `oxc/no-map-spread` — `arr.map(x => ({ ...x }))` is the immutable-update idiom; mutating breaks reactivity.
  - `unicorn/no-new-array` — deliberate hot-path preallocation (`new Array(CAP)` ring buffers).
  - `no-template-curly-in-string` — doc strings that show `${...}` literally.
  - `promise/no-callback-in-promise` — `.then(ok, err)` middleware bridges.
  - `typescript/no-this-alias` — deliberate `this` capture in the signal hot path and compat shims.
  - `unicorn/no-useless-spread` — defensive `[...coll]` snapshots before deleting while iterating.
  - `typescript/no-non-null-assertion` — `!` is used where null is provably impossible.
  - `vitest/expect-expect`, `vitest/require-mock-type-parameters` — false positives against custom assertion helpers.
  - `jsx-a11y/label-has-associated-control`, `control-has-associated-label` — label association needs cross-element resolution an AST walker cannot do.
- **Scoped off:** `no-console` in `examples/**`, `packages/**/scripts/**` and CLI packages; the jsx-a11y interactivity set in `examples/**` and `packages/ui/primitives/src/**` (headless primitives provide a11y through ARIA helpers the AST cannot see); `vitest/no-disabled-tests`, `no-conditional-tests`, `valid-title` in `**/*.test.*`; `unicorn/no-empty-file` in `**/*.d.ts`; `unicorn/no-thenable` in the native compiler (`then` is an IR field).

Before gating a rule or forcing a fix, read its findings. Several rules that looked fixable (`no-thenable`, `valid-expect`, `no-control-regex`, `no-map-spread`, `no-useless-spread`) were flagging correct code.

### Lint ratchets

- **oxlint:** `lint-baseline.json` + `scripts/check-lint-ratchet.ts` (CI `Lint Ratchet`, also in `validate-fast` and pre-push). A change that pushes any `warn` rule above its baseline fails. The baseline only moves down: after fixing findings, run `bun run check-lint-ratchet -- --update` and review the diff. Never raise a count to absorb a new finding. `error` rules are not in the baseline. Logic is tested in `packages/internals/test-utils/src/tests/lint-ratchet.test.ts`.
- **@pyreon/lint over framework `packages/*/src`:** `pyreon-lint-baseline.json` + `scripts/check-pyreon-lint-ratchet.ts` (same `Lint Ratchet` job) lock the advisory `warn` + `info` findings; the baseline is at `total: 0`. The `Pyreon Lint Gate` (`pyreon doctor --only lint --ci`) is the error tier. Some rules are user-app best practices the framework is the legitimate exception to (for example `no-raw-addeventlistener` in `@pyreon/hooks`, the wrapper layer). Scope those off for the package in `.pyreonlintrc.json` with a rationale; do not churn correct internals. Logic is tested in `pyreon-lint-ratchet.test.ts`.

### @pyreon/lint rules

- **Rule IDs.** Strictly kebab-case, enforced by `rule-registry.test.ts`. If a rule covers the same defect as a well-known ESLint or jsx-a11y rule, use that id verbatim (`anchor-is-valid`, `no-autofocus`). Otherwise use `no-*` (prohibition), `prefer-*` (both work, one is better) or `require-*` (something must be present). Some ids fall outside these prefixes (`heading-order`, `color-contrast`, `query-options-as-function`); do not rename existing ids — renames break consumer configs and `pyreon-lint-ignore` comments.
- **Severity means a defect class.** `error`: wrong at runtime (reactivity silently lost, SSR breaks, an assistive-tech user is blocked). `warn`: a latent hazard or contract violation. `info`: a preference; it never gates CI (`strict` promotes `warn` to `error` and leaves `info` alone). Two rules that detect the same defect must agree on severity. The current split (37 error / 77 warn / 18 info) has not been re-reviewed against this model as a whole; fix an assignment when you touch a rule and can justify it.
- **Autofixes never change semantics.** A fix is `Fix | readonly Fix[]`; use the array form when one fix needs several edits (for example rewrite an expression and add the import it needs, as `prefer-isserver` does). `applyFixes` applies a multi-edit fix whole or not at all, and defers any fix that overlaps one already applied. Read edits through `fixEdits(d.fix)`, never by assuming one edit. Gate a fix on the unambiguous shape only: `no-signal-call-write` rewrites `sig(5)` → `sig.set(5)` but leaves `sig(prev => prev + 1)` alone, because `.set(fn)` would store the function. `no-peek-in-tracked` has no fixer, because `.peek()` in a tracked scope is often intentional loop prevention.
- **One suppression comment for both matchers.** `// pyreon-lint-ignore <id>` (alias `// pyreon-lint-disable-next-line`) silences a `@pyreon/lint` rule and a `pyreon doctor` / MCP `validate` detector finding (`detectPyreonPatterns` / `detectReactPatterns`), by bare code or prefixed id (`pyreon-patterns/as-unknown-as-vnodechild`). Use it when a detector without a type checker flags correct code (for example `@pyreon/router`'s `child as unknown as VNodeChild` over `VNodeChild | null`, where removing the cast is a TS2769). Always suppress by code, never bare, with the reason in a comment above. A rule that is wrong across a whole package belongs in `exemptPaths` instead.
- **Rule options.** Config entries accept a severity (`"error"`) or a `[severity, options]` tuple. `options.exemptPaths: string[]` (substring match on the file path) is honoured centrally by the runner for every rule. The root `.pyreonlintrc.json` exempts DOM-runtime, server-only and wrapper-foundation packages (for example `packages/core/runtime-dom/` from `no-window-in-ssr`). Never hardcode monorepo paths in rule source — use `exemptPaths`.

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
- Context: `provide(ctx, value)` — provides for the current component's subtree and is released on unmount
- `ExtractProps<T>` extracts props from a ComponentFn or passes through
- `HigherOrderComponent<HOP, P>` for typed HOC patterns

## UI Components (@pyreon/ui-components)

- **Layout in `.attrs()`, CSS in `.theme()`.** Element layout props go in `.attrs()`; visual styles (colors, spacing, borders, shadows, type) go in `.theme()`. Element is a flex box already — never re-declare `display`/`flexDirection`/`alignItems`/`justifyContent` in a theme; it fights the wrapper CSS and never reaches the button/fieldset/legend flex-fix inner layer. The prop contract:
  <!-- @props @pyreon/elements Element: contentDirection, contentAlignX, contentAlignY, direction, alignX, alignY, gap, block, equalCols, equalBeforeAfter, beforeContent, afterContent -->
  - Simple elements (no before/after slots — the common case) read `contentDirection` (`'inline'` row / `'rows'` column, default `rows`), `contentAlignX`, `contentAlignY`. The bare `direction`/`alignX`/`alignY` trio controls the slot axis of compound elements.
  - Alignment is axis-fixed, not main/cross: X is horizontal (`left|center|right|spaceBetween|spaceAround|block`), Y is vertical (`top|center|bottom|block`); `block` means stretch.
  - `gap` is a prop (number → rem), wired on the simple path and the flex-fix layer.
  - Use `block: true` for full-width elements and app roots. Element defaults to `inline-flex` and shrink-wraps.
  - Theme layout is correct only for `flexWrap` (no Element prop), CSS grid components, and text truncation (`display: 'block'` — a flex container never ellipsizes).
  - Never put layout in an attrs `css` string: a per-instance `css` prop replaces it wholesale, and it sits outside the theme cascade.
- **Pseudo-state styles:** use `hover`, `focus`, `active`, `disabled` objects inside `.theme()` callbacks. The `el`/`txt` bases generate the selectors via `makeItResponsive`.
- **Hover CSS is unconditional:** `:hover` styles apply to every component that defines them. Only `cursor: pointer` is gated on interactivity (onClick/href).
- **CSS property naming:** unistyle order (`borderWidthTop`, `borderColorLeft`), not CSS-spec order (`borderTopWidth`).
- **`useBooleans: false`** (the default): rocketstyle dimensions take strings (`state="primary"`, `size="large"`), not booleans.
- **Comfortable sizes:** menu items, dropdown options and interactive list items need at least `t.spacing.small` (8px) vertical / `t.spacing.medium` (12px) horizontal padding.
- **Use `@pyreon/hooks` for events:** `useEventListener`, `useScrollLock`, `useClickOutside`. Never raw `addEventListener`/`removeEventListener` in primitives.
- **Use `@pyreon/elements` Overlay** (`useOverlay`) for tooltips, popovers and dropdowns — positioning, viewport flipping, ESC, click-outside, scroll tracking, hover delay. Never reimplement overlay positioning.
- **Semantic HTML:** `.config({ component: 'hr' })` sets the outer rocketstyle tag (Divider, `nav` containers); `tag` in `.attrs()` sets the Element's inner tag.
- **Static ARIA defaults go in `.attrs()`.** A presentational component with no `@pyreon/ui-primitives` base carries its role/name as a static default:
  - `Loader` → `{ role: 'status', 'aria-label': 'Loading' }`
  - `Pagination` → `{ 'aria-label': 'Pagination' }`
  - `Tooltip` → `{ role: 'tooltip' }` (the trigger owns `aria-describedby`)
  - `Breadcrumb` → `{ tag: 'nav', 'aria-label': 'Breadcrumb' }`; mark the current `<BreadcrumbItem>` with the string `aria-current="page"`

  Consumers override by passing their own value (props win over `.attrs()` via `mergeProps`). Values must be static strings (no `undefined`/boolean branch). Interactive state ARIA (`aria-checked`/`aria-selected`/`aria-expanded`) belongs to the `*Base` primitive. Test with value assertions (`getAttribute('role') === 'status'`), never `hasAttribute`.
- **Severity-driven live regions use the `.attrs((props) => …)` callback.** For a component with a severity dimension (`Alert`), `error`/`warning` get `role="alert"` + `aria-live="assertive"`, `info`/`success` get `role="status"` + `aria-live="polite"`. Type it with `.attrs<{ state?: … }>(...)`. Set `aria-live` explicitly alongside `role`, because an alert container often pre-exists and its content mutates in place. The callback reads `state` once at setup; a runtime severity change needs an explicit `role`/`aria-live` prop. An ambient card (`Notification`) stays fixed at `role="status"` + `aria-live="polite"`. Test each state's mapping plus an override.

## UI Primitives (@pyreon/ui-primitives)

- **Use `useControllableState({ value, defaultValue, onChange })`** from `@pyreon/hooks` for every controlled/uncontrolled primitive. Never hand-roll `isControlled + signal + getter`.
- **Keyboard navigation lives in `keyboard.ts`:**
  - `navigateByRole()` — arrow keys between siblings (tabs, radios) plus `Home`/`End`. Takes `containerSelector`, `itemSelector`, `keys` (`'horizontal'|'vertical'|'both'`).
  - `createTypeahead(resetMs?)` — a per-instance printable-character buffer (resets after ~500ms idle); create one per primitive. `typeaheadMatch(labels, buffer, currentIndex)` does the case-insensitive prefix match (a repeated single char cycles from `currentIndex + 1`). Pass `currentIndex = -1` when nothing is active yet. ComboboxBase and TreeBase use these; do not hand-roll another typeahead.
  - A container-level keydown handler that owns shortcuts must bail when `e.target` is an editable field (INPUT/TEXTAREA/SELECT/contentEditable).
- **Implemented keyboard patterns:** ComboboxBase handles ArrowUp/Down, `Home`/`End`, Enter/Escape/Tab and typeahead. TreeBase handles all arrows, Enter/Space, `Home`/`End`, typeahead and `*` (expand all siblings). TreeBase `ArrowLeft` collapses an expanded node, otherwise moves focus to the parent (a no-op at root level); `getParentOf` resolves against the data, not the visible list.
- **Render-function primitives expose ARIA helpers** in their state: ComboboxBase `inputProps()`, `listboxProps()`, `getOptionProps()`; TreeBase `treeProps()`, `getItemProps()`; FileUploadBase `inputProps`; CalendarBase `gridProps()`, `rowProps`, `columnHeaderProps`, `getDayProps(day)` (date grid with full-date `aria-label` and one roving `tabIndex=0`).
- **ARIA state values are strings**, not booleans: `'aria-selected': day.isSelected ? 'true' : 'false'`, or `cond ? 'true' : undefined` to omit. A boolean renders presence-only `aria-selected=""`, which assistive tech does not read as true. The runtime (`applyStaticProp`, and `_setAttr` on the compiled path) coerces boolean `aria-*` as a safety net, but helpers must emit strings. Every current primitive does.
- **Reactive conditional rendering:** `return (() => { if (!cond()) return null; return <div>...</div> })`, not a top-level `if (!cond()) return null`. Components run once.
- **No `as unknown as VNodeChild`:** a VNode is already assignable to `VNodeChild`.

## Dead Code

- Remove dead code rather than commenting it out
- If browser APIs are removed from spec, remove the code that uses them
- Don't add backwards-compatibility shims for removed features
- An "unused import/variable" finding is a symptom, not a verdict. Ask why the symbol was written before deleting it. In tests especially, an unused cleanup handle (`const { unmount } = mountWith(...)` never called) is usually a leak — call it; an unused constant in a contract test (for example an imported `*_ADAPTER_OUTPUT`) is usually a missing assertion — assert it. Record the reasoning in a comment so the next analyzer run does not re-suggest the deletion.
