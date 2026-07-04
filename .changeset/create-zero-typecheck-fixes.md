---
'@pyreon/create-zero': patch
---

Fix scaffolded projects failing `tsc` / editor type-check out of the box, plus two real template bugs that runnable type-checking surfaced:

- **`TS2688: Cannot find type definition file for 'bun'`** — every generated `tsconfig.json` declares `types: ["bun", …]`, but `@types/bun` was never a dependency. A standalone (non-workspace) scaffold therefore failed `tsc` and showed project-wide editor errors (the repo's own examples only compiled because the monorepo hoists the dep from root). Now `@types/bun` ships in the generated `package.json` and the monorepo `ui`/`types` package templates, the pointless `types: ["bun"]` is dropped from the code-less monorepo root tsconfig, and generated apps gain a `typecheck` script.
- **`counter.tsx`** — `{isEven ? "true" : "false"}` used the computed as a bare ternary condition (auto-call only rewrites a bare `{isEven}` child), so it was always truthy — the demo always rendered "true". Fixed to `{() => (isEven() ? "true" : "false")}`.
- **dashboard `login.tsx` / `signup.tsx`** — called `signIn`/`signUp` without `await`; correct against the sync in-memory stub but broken (type + runtime) once the Supabase integration swaps in the async auth implementation. Now awaited (correct for both).
- **blog `posts.ts`** (`ComponentFn<unknown>`) and **email integration `email.ts`** (`sendEmail<TProps>`) violated `ComponentFn`'s `Props` constraint — fixed.

Also refreshes generated dependency floors to the tested workspace versions (typescript ^6.0.3, vite ^8.0.16, @tanstack/query-core ^5.101.2, table-core ^8.21.3, virtual-core ^3.17.3, zod ^4.4.3) and adds a regression guard asserting every `types: ["bun"]` tsconfig has a matching `@types/bun` dep.
