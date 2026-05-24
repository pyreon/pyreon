---
'@pyreon/vite-plugin': patch
---

Phase 1ζ prototype: opt-in `resolveId` normalization for `@pyreon/*` packages.

`pyreon({ normalizePyreon: true })` adds a `resolveId` hook step that tracks the FIRST resolved path for every `@pyreon/<pkg>` specifier and returns that same path for any subsequent import of the same specifier. Stronger than `resolve.dedupe` (Candidate α) because it works at the resolver level for ALL imports, not just bare specifiers — catches transitive imports with different importers that dedupe alone might miss.

Default `false` until Phase 3 of the cross-module-state cleanup decides which prevention mechanism wins. See `.claude/plans/jaunty-herding-kazoo.md`.

This is one of three prototypes (α, β, ζ) being measured. The winner of Phase 2 becomes the default; others get archived.
