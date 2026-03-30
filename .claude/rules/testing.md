# Testing Rules

## Test Runner

- Use `bun run test` to run all package tests (runs `bun run --filter='./packages/*' test`)
- Each package has its own `vitest.config.ts` extending root `vitest.shared.ts`
- Vitest globals enabled — no need to import `describe`, `it`, `expect`, `vi`

## DOM Testing

- Packages `runtime-dom`, `router`, `head`, `react-compat`, `preact-compat`, `vue-compat`, `solid-compat` use `environment: "happy-dom"`
- happy-dom means `typeof window !== "undefined"` is always true — SSR-only branches are unreachable in tests
- Use `document.createElement`, `container.innerHTML`, etc. directly in tests

## Coverage

- All packages maintain >95% on all 4 metrics (statements, branches, functions, lines)
- V8 coverage counts branch sides for `??`, `||`, ternary — use type assertions (`as Type`) or `!` for provably-safe paths to avoid uncoverable branches
- Module-level const captures (e.g., `const _isBrowser = typeof window !== "undefined"`) move branches from per-call to module-load time
- Run coverage: `cd packages/<name> && bun run test -- --coverage`

## Test Organization

- Test files live in `packages/<name>/src/tests/` as `*.test.ts` or `*.test.tsx`
- Name test files after the module they test (e.g., `signal.test.ts` for `signal.ts`)
- Use `describe` blocks to group by feature, `it` blocks for individual cases
