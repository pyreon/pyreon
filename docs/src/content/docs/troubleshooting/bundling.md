---
title: "Bundling Mistakes"
description: "Common bundling mistakes in Pyreon and how to fix them."
---

# Bundling Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### A convenience barrel is a REACHABILITY EDGE, and `sideEffects` — not `/* @__PURE__ */` — is the lever.

A generated or hand-written `index.ts` that `export *`s every layer makes importing ONE symbol reach every module it names, and a bundler RETAINS a module-level CALL unless it can prove the call pure. `api.endpoint('GET /x', …)`, `s.object({ … })`, `mock(routes)` are all module-level calls, so the barrel pins them — and anything they reference. Measured (Vite 8, 30-tag/120-op generated client, importing one hook): **30,710 B / 2,420 gz with 120 endpoints AND 120 mock fixtures**, against **5,748 B / 642 gz with 4 endpoints** once a `package.json` declared `sideEffects`. **The reflex fix does not work**: annotating each declaration `/* @__PURE__ */` measured 2,041 → 2,000 B (2%), because the ARGUMENTS are themselves calls (`s.string().uuid()`) esbuild must still evaluate — purity is asked per-EXPRESSION, `sideEffects` per-MODULE, and the question is about the module. Two traps around it. **(a) The declaration must be TRUE**: `false` is a lie if any emitted module has a real module-scope effect (an `installMocks()` call in a workbench wrapper), so use the ARRAY form naming those files — a bundler acts on the claim. **(b) The behaviour is CONFIGURATION-DEPENDENT until you emit the marker yourself**: an app whose own `package.json` already declares `sideEffects: false` covers files generated into its tree and was never affected, so the same code measures differently in two repos. Emitting a `package.json` beside the output removes that dependency (include `"type": "module"` — the file becomes the NEAREST package.json for everything under it, and under Node16 resolution one without `type` means CommonJS, silently reclassifying the output). **DATA is the sharp edge**: an unused FUNCTION shakes out everywhere, but a fixture table, a route array or a lookup map survives minification wherever it is reachable — which is how a dev-only fixture set ships to production through a barrel that merely NAMES it. **The durable fix is structural, not a hint**: keep dev surfaces out of the production entry entirely (`./dev`, the `@pyreon/server/client` shape) so there is no edge for any bundler to follow, hint honoured or not. Reference: `packages/tools/lathe/src/emit/{entries,package-marker}.ts` + `tests/entry-points.test.ts` (24-case matrix, run WITH and WITHOUT the marker — the no-marker half is load-bearing: re-adding a dev export to the barrel fails ONLY those, since with the marker the bundler shakes the regression out invisibly).

---

### A bundle assertion keyed on a GENERATED IDENTIFIER is vacuous — minification renames it.

`expect(bundle).not.toContain('seedFaker')` passes with the whole module bundled, because `seedFaker` minified to one letter. Assert on things minification cannot touch: EXTERNAL import specifiers (`@faker-js/faker`) and string DATA (a fixture uuid). And pair every "must be ABSENT" suite with a CONTROL that bundles the module and requires each marker PRESENT — without it the suite passes just as well when the emitter stops producing anything. The control must reach every surface at once (`export *`), since importing one symbol correctly shakes the rest away. Reference: `lathe/src/tests/entry-points.test.ts:DEV_MARKERS`.

---
