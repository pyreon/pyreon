---
title: "Bundling Mistakes"
description: "Common bundling mistakes in Pyreon and how to fix them."
---

# Bundling Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### A barrel is a reachability edge; `sideEffects`, not `/* @__PURE__ */`, fixes it

An `index.ts` that `export *`s every layer makes one import reach every module-level call (`api.endpoint(…)`, `s.object(…)`, `mock(routes)`). Annotating each call `@__PURE__` barely helps because the arguments are calls too; `sideEffects` is decided per module.
  - The declaration must be true: use the array form naming files with real module-scope effects.
  - Emit a `package.json` (with `"type": "module"`) beside generated output so the result does not depend on the consuming app's config.
  - Unused data (fixture tables, route arrays) survives minification wherever reachable. Keep dev surfaces out of the production entry (`./dev`, like `@pyreon/server/client`).
  - Code: `packages/tools/lathe/src/emit/{entries,package-marker}.ts`. Test: `lathe/src/tests/entry-points.test.ts` (run with and without the marker; the no-marker half catches barrel regressions).

---

### A prop-gated optional feature cannot tree-shake

A branch on a runtime prop is reachable code. In `@pyreon/charts`, geometry and marks tree-shake as imports, but `navigator`, `dataZoom` and `brush` are `props.x === true` branches inside `packages/fundamentals/charts/src/engine/Chart.tsx`, so every chart import pays for them. An optional feature tree-shakes only when it is an import: register it at module load into a core slot (like `setThemeEngine`, `setStyleExtraction`). Detect by bundling the minimal import and grepping for a symbol only the optional half defines; a size budget only says something grew.

---

### A bundle assertion keyed on a generated identifier is vacuous

Minification renames `seedFaker`, so `not.toContain('seedFaker')` always passes. Assert on external import specifiers (`@faker-js/faker`) and string data. Pair every "must be absent" suite with a control that bundles everything (`export *`) and requires each marker present. Reference: `lathe/src/tests/entry-points.test.ts:DEV_MARKERS`.

---
