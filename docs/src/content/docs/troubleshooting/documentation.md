---
title: "Documentation Mistakes"
description: "Common documentation mistakes in Pyreon and how to fix them."
---

# Documentation Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Forgetting to update all surfaces

CLAUDE.md, docs/, README, llms.txt, llms-full.txt, MCP api-reference must all stay in sync

---

### Outdated examples

Examples must compile and run — no pseudocode in docs

---

### Literal backslashes in manifest `summary` / `mistakes` / `example` string VALUES

(caught in the styler manifest migration, PR after #624; **renderer FIXED in PR #1442**): `@pyreon/manifest`'s `renderStringLiteral` historically escaped `` ` `` → `` \` `` and `${` → `\${` but NOT literal backslashes. A manifest string whose resolved value contained a literal `\` (e.g. ` ``` `bash in a CodeGroup example body) serialized to `\\\`` in the generated file = (escaped backslash)(RAW backtick) → premature template-literal close in `api-reference.ts` → tsc parse failure. **The renderer now escapes `\` FIRST** (before backticks + `${`), so the bug class is structurally closed. Reference: `packages/internals/manifest/src/render.ts:renderStringLiteral` (post-fix). Symptom guide for the historical shape (still relevant if someone reverts): after `bun run gen-docs`, `bunx oxlint packages/tools/mcp/src/api-reference.ts` — a parse error in the freshly-generated region (not the hand-written ones) is this bug.

---

### `<Playground code={` … `}>` in docs (deprecated)

iframe-sandboxed string-blob code with nested template-literal escape passes — the exact shape behind PR #1434's `'\n'` double-unescape `SyntaxError`. **Migrated wholesale in PR #1448** (36 instances across 30 docs-zero pages → `<Example file="./examples/<topic>/<slug>" />`). For new docs always use `<Example>`. The legacy VitePress `docs/` site retains `<Playground>` until it's fully cut over to docs-zero. **Reusable migration tooling**: `scripts/migrate-playground-to-example.ts` (parses + extracts + rewrites) + `scripts/batch-fix-example-types.ts` (iterative TS strict-mode fixup). **Don't author new `<Playground>` calls** — the value prop ("type-checked, refactor-safe, cross-mount signal-share") is structurally absent. Enforced by `pyreon/no-playground-in-docs` lint rule.

---

### `<Example>` example components that hard-require `props.shared`

every example component MUST accept `{ shared?: Signal<T> }` and fall back to a local signal — `const count = props.shared ?? signal(0)`. Without that fallback, the example breaks when used WITHOUT `share` (i.e., as a standalone single demo). The contract is "bridgeable, not require-bridged." Reference: `docs/src/examples/reactivity/signals-read-write-react.tsx` for the canonical shape.

---

### `as never` casts on accessor-form JSX attribute values

(fixed at the root in PR #1442): the canonical Pyreon pattern for reactive attributes is `attr={() => sigCall() === target ? 'value' : undefined}`. Several attrs in `@pyreon/core`'s JSX types declared the static-value union but missed the function-accessor variant — `aria-current`, etc. Consumer code had to write `(() => …) as never` to silence the type error. **Fix the root cause** in `packages/core/core/src/jsx-runtime.ts` by adding `| (() => UnionOfStaticTypes | undefined)` to the attr's type, matching the shape used by `aria-selected`, `aria-disabled`, `aria-hidden`. Audit every accessor-supported attr to ensure the function variant is present.

---
