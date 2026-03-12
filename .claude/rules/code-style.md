# Code Style Rules

## Linting
- Biome v2 for linting and formatting
- Config in root `biome.jsonc`
- Biome v2 uses `files.includes` with `!` prefixes (not `files.ignore`)
- Run: `bunx biome check --write .`

## TypeScript
- `exactOptionalPropertyTypes` enabled — optional properties need explicit `| undefined`
- `jsx: "preserve"` with `jsxImportSource: "@pyreon/core"` in root tsconfig
- `customConditions: ["bun"]` in root tsconfig for workspace resolution
- No build step needed for development — `"bun": "./src/index.ts"` in each package's exports

## Conventions
- Prefer `signal<T>()` callable pattern (not `.value` getter/setter)
- Components are plain functions: `ComponentFn<P> = (props: P) => VNode | null`
- `onMount` returns `CleanupFn | undefined` (not `void`)
- Use `h()` or JSX — both produce VNodes
- `<For>` uses `by` prop (not `key`) because JSX extracts `key` specially
- Context: `pushContext(new Map([[ctx.id, value]]))` + `onUnmount(() => popContext())`

## Dead Code
- Remove dead code rather than commenting it out
- If browser APIs are removed from spec, remove the code that uses them
- Don't add backwards-compatibility shims for removed features
