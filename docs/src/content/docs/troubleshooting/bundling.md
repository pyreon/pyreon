---
title: "Bundling Mistakes"
description: "Common bundling mistakes in Pyreon and how to fix them."
---

# Bundling Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### A dev-only check that reads a REST parameter keeps the parameter in production.

`signal()`'s read closure was `(...args) => { if (dev && args.length) warn(); … }` — the bundler folds the warning away but not the signature, so production shipped `(...e)=>` and every signal READ could materialize an array it never looked at. Put the dev and prod shapes in two declarations chosen by the dev gate (`const read = process.env.NODE_ENV !== 'production' ? (...args) => … : () => …`). Reference: `packages/core/reactivity/src/signal.ts`.

---

### A client guard that ships a name list the ELEMENT already answers.

Refusing `on*` handler attributes on the client used `EVENT_HANDLER_ATTRS` (~160 names, ~0.8 KB gz — the largest item in a minimal app bundle), yet a content attribute is only ever compiled into a handler when the element's interface defines that IDL handler, so `key in el` is the engine's exact answer. The client asks the element (`isElementEventHandlerAttr`); SSR, with no element, keeps the list. Two traps: happy-dom defines far fewer handlers than Chromium (no `onload` on `<div>`/`<meta>`, none on MathML), so the refusal must be proven in real Chromium, not happy-dom; and a shared guard must take the predicate as a PARAMETER (`@pyreon/head`'s `isHeadAttrSafe`), because importing the list anywhere in a client module ships it. Measure these by bundling a real app with every `@pyreon/*` package INCLUDED — per-package budgets externalize `@pyreon/core`, where the list lived, and showed the win as −14 B. Reference: `packages/core/core/src/url-guard.ts:isElementEventHandlerAttr`, `runtime-dom/src/tests/event-handler-attr.browser.test.tsx`.

---

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

### A bundle assertion keyed on a generated identifier is vacuous

Minification renames it, so `expect(bundle).not.toContain('seedFaker')` passes with the module bundled. Assert on what minification cannot touch: external import specifiers (`@faker-js/faker`) and string data (a fixture uuid). Pair every "must be absent" suite with a control that bundles the module (via `export *`, so every surface is reached) and requires each marker present; otherwise the suite also passes when the emitter produces nothing. Reference: `lathe/src/tests/entry-points.test.ts:DEV_MARKERS`.

---
