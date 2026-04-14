# Code Style Rules

## Linting & Formatting

- **oxlint** for general JS/TS linting (400+ rules, Rust-powered)
- **oxfmt** for formatting (Rust-powered, Prettier-compatible)
- **@pyreon/lint** for Pyreon-specific rules (58 rules, 12 categories)
- Config files: `.oxlintrc.json` (linting), `.oxfmtrc.json` (formatting), `.pyreonlintrc.json` (Pyreon-specific rules)
- Run lint: `bun run lint` (runs `oxlint .` from root)
- Run format: `bun run format` (runs `oxfmt --write .`)
- Check format: `bun run format:check` (runs `oxfmt --check .`)
- Inline suppression: `// oxlint-disable-next-line rule-name` (not `biome-ignore`)
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
