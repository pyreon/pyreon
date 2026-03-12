# Contributing to Pyreon

Thanks for your interest in contributing to Pyreon! This guide will help you get started.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.1+
- Node.js 20+ (for some tooling)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/pyreon/pyreon.git
cd pyreon

# Install dependencies
bun install

# Run all tests
bun run test

# Type-check all packages
bun run typecheck

# Lint
bun run lint
```

### Workspace Structure

Pyreon is a monorepo with packages under `packages/`:

| Package | Description |
|---|---|
| `@pyreon/reactivity` | Signals, computed, effects, stores |
| `@pyreon/core` | VNode, h(), Fragment, lifecycle, context, JSX |
| `@pyreon/runtime-dom` | DOM renderer, mount, hydrate, transitions |
| `@pyreon/compiler` | JSX transform, static hoisting, template emission |
| `@pyreon/runtime-server` | renderToString, renderToStream |
| `@pyreon/router` | Client and SSR routing |
| `@pyreon/head` | Document head management |
| `@pyreon/server` | SSR handler, SSG prerender, islands |
| `@pyreon/vite-plugin` | Vite integration |
| `@pyreon/react-compat` | React compatibility layer |
| `@pyreon/preact-compat` | Preact compatibility layer |
| `@pyreon/solid-compat` | SolidJS compatibility layer |
| `@pyreon/vue-compat` | Vue 3 Composition API compatibility layer |

Each package resolves via `"bun": "./src/index.ts"` in exports — no build step needed during development.

## How to Contribute

### Reporting Bugs

1. Search [existing issues](https://github.com/pyreon/pyreon/issues) first.
2. Include a minimal reproduction (code snippet, repo link, or failing test).
3. Include your environment: Bun version, OS, browser (if relevant).

### Suggesting Features

Open a [discussion](https://github.com/pyreon/pyreon/discussions) or issue with:
- The use case you're trying to solve
- Your proposed API or approach
- Any alternatives you've considered

### Submitting Changes

1. **Fork and branch.** Create a feature branch from `main`.
2. **Write tests.** Every change should have test coverage.
3. **Follow the style.** Run `bun run lint` and `bun run typecheck` before committing.
4. **Keep commits focused.** One logical change per commit.
5. **Open a PR.** Describe what changed and why.

### Running Tests

```bash
# All packages
bun run test

# Single package
cd packages/reactivity && bun run test

# With watch mode
cd packages/core && bunx vitest
```

DOM-dependent packages (`runtime-dom`, `router`, `head`, compat packages) use `happy-dom` as the test environment.

### Code Style

- **Biome** for linting and formatting (`bun run lint`, `bun run check`)
- **TypeScript** strict mode with `exactOptionalPropertyTypes`
- No default exports — use named exports
- Prefer `const` over `let`
- No classes in core packages (plain functions + closures)

### Commit Messages

Use clear, imperative-tense messages:

```
fix(router): prevent open redirect via sanitizePath
feat(reactivity): add createSelector for O(1) lookups
test(core): add coverage for Suspense timeout
docs(head): update SSR examples
```

## Architecture Notes

- **Signals** are the foundation — one closure per signal, subscribers tracked via `Set<() => void>`.
- **Components run once** (setup phase). Reactivity handles updates at the DOM node level.
- **SSR** uses `AsyncLocalStorage` for per-request context isolation.
- **The compiler** transforms JSX to `_tpl()` + `_bind()` calls for optimal DOM creation via `cloneNode`.

See [CLAUDE.md](./CLAUDE.md) for detailed architectural documentation.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
