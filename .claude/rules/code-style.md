# Code Style Rules

## Linting & Formatting

- **oxlint** for general JS/TS linting (400+ rules, Rust-powered)
- **oxfmt** for formatting (Rust-powered, Prettier-compatible)
- **@pyreon/lint** for Pyreon-specific rules (55 rules, 12 categories)
- Config files: `.oxlintrc.json` (linting), `.oxfmtrc.json` (formatting)
- Run lint: `bun run lint` (runs `oxlint .` from root)
- Run format: `bun run format` (runs `oxfmt --write .`)
- Check format: `bun run format:check` (runs `oxfmt --check .`)
- Inline suppression: `// oxlint-disable-next-line rule-name` (not `biome-ignore`)

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

## Dead Code

- Remove dead code rather than commenting it out
- If browser APIs are removed from spec, remove the code that uses them
- Don't add backwards-compatibility shims for removed features
