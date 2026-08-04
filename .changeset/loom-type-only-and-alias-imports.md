---
'@pyreon/loom': patch
---

`loom scan` reported correct TypeScript as broken. Two false-positive classes,
both found by running it against a real foreign 87-package monorepo rather
than against this repo — loom's entire job is reading workspaces it has never
seen, so its own conventions are the least interesting ones to test against.

**Type-only imports were counted as runtime dependencies.** `import type { X }
from 'dev-dep'` is the *correct* pattern — the import erases at build, so a
consumer never needs the package installed — yet it drove
`prod-import-of-dev-dep` on 9 of 12 findings, every one of them correct code.
The scan now tracks a third surface: statement-level `import type` /
`export type` (multi-line included) plus everything inside a `.d.ts`. A
type-only import of a devDependency is silent; one of an *undeclared* package
surfaces as the new info-level `phantom-type-dep`, which says what is actually
true — erased at runtime, so consumers are unaffected, but typecheck resolves
it through hoisting luck.

**tsconfig path aliases scanned as packages.** `~` was admitted by the package
-name grammar although npm names cannot contain it, so every
`import '~/components/X'` became a phantom dep — at *warning* severity, which
means `--strict` failed CI on a non-issue. `~` is out of the grammar, and
`compilerOptions.paths` prefixes are now read from the package's tsconfig and
the workspace root's (JSONC, one relative `extends` hop) so `@app/*` and
`baseUrl`-relative specifiers are recognised as internal too.

Measured on that repo: gating warnings 4 → 2 (the two survivors are real
version drift), `prod-import-of-dev-dep` 12 → 1 (the survivor is a genuine
runtime import), and all 75 `unused-dep` findings byte-identically intact —
that last number is the one that mattered, because splitting type imports out
of the runtime bucket without teaching `unused-dep` about the new surface
would have accused every type-only dependency of being dead.

Bisect-verified five ways: restoring `~` to the grammar, dropping the alias
lookup, sending type imports back to the runtime buckets, removing the
`unused-dep` guard, and re-introducing this fix's own first-cut regex — the
newline-excluding one that silently missed prettier-wrapped multi-line type
imports, the dominant real-world shape.
