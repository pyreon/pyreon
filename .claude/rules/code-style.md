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

## Dead Code

- Remove dead code rather than commenting it out
- If browser APIs are removed from spec, remove the code that uses them
- Don't add backwards-compatibility shims for removed features
