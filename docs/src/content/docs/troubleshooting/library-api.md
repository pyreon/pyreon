---
title: "Library API-Shape Mistakes"
description: "Common library api-shape mistakes in Pyreon and how to fix them."
---

# Library API-Shape Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Importing `@pyreon/charts` through a pre-0.52 entry point

The main entry is now the engine (`<Chart>` with mark children, formerly `<Plot>` at `/plot`), and the ECharts wrapper is `<EChart>` at `/echarts`, with `/manual` and `/vite` under it. `<Chart options={…}>` from the root is the old wrapper and no longer type-checks.
  - `pyreon check --fix` rewrites each import to the entry that exports the name now, and renames `Plot`→`Chart`, `Tip`→`Tooltip` and the wrapper's `Chart`→`EChart` at every reference.
  - The wrapper is told apart from the grammar by an `options` attribute or a wrapper-only name in the same import.

**Detected by:** `charts-legacy-import` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Narrower projections silently drop a new struct field

A layer that copies a shared struct field by field into its own narrower type compiles and renders when a field is added, but loses it. In `@pyreon/charts`, `values2` (a band's second bound) was lost by the value labels, a11y description and tooltip types, and the bubble mark's reader surfaces held pixel `radii` instead of the datum. Rules:
  - When adding a field to a cross-layer struct, grep for every type that restates its shape. Pass by reference where possible.
  - A totality spec must have no unexamined exemptions; a documented limit and an unwritten branch look the same.
  - Classify every field in a total `Readonly<Record<keyof Series, 'data' | 'presentation'>>` so a new field does not compile until classified, and assert every `data` field reaches the reader-facing surface.
  - PMTC limits for these modules: `if (x !== undefined)` narrowing does not carry (use `?? []` / `?? NaN`); a TS `const` lowers to Swift `let`, so rebuild the object instead of assigning a property; index parameters are `number`, not `Double`.
  - Reference: `packages/fundamentals/charts/src/engine/{render,a11y,tooltip}.ts`; locks `series-channels.test.ts`, `show-values.test.ts`, `band-a11y.test.tsx`.

---

### An issue-count window across an `await` on a shared accumulator

Comparing `ctx.issues.length` before and after an await misattributes a sibling's concurrent issues. `@pyreon/validate`'s `.catch` runs its pipeline against a private child ctx (sharing only `path`/`context`) and merges up on success. Length windows are valid only across synchronous code (same family as leak Class A). Reference: `packages/fundamentals/validate/src/core/schema.ts:compiledWithCatch`/`finishCatch`; locked by `src/tests/jit-async-differential.test.ts` — keep async-capable grammar in differential fuzzers, sync fuzzers cannot interleave.

---

### A public union member with no runtime handler

`audit-types` checks interface fields, not union members, so a `kind`/`format` member with no dispatch entry slips through (`@pyreon/document`'s `'json' | 'jsonl'` once threw `No renderer registered`). Every member needs a handler or must leave the union. Related rules from the same package:
  - Each renderer has its own `switch (node.type)`; a missing case with no `default` drops a primitive for that target (docx handles `page-break`).
  - A renderer emitting parsed structured text escapes its delimiters: markdown table cells escape `\` then `|`, and newlines become `<br>` (`renderers/markdown.ts:mdTableCell`).
  - Locks: `tests/json-jsonl-md-table.test.ts`, `tests/integration.test.ts` (docx page-break).

---

### Guarding only the field a report named

When a value can break out of an attribute or style position, enumerate every value that reaches that position and route them through one funnel. In `@pyreon/document`: style values go through `sanitizeStyle` (`cssDecl`/`styleDecls` in `renderers/css.ts`); numerically typed fields (`width`, `height`, `thickness`, `borderRadius`, `size`, `lineHeight`, `gap`, `level`) are coerced with `sanitizeNumber` to a finite number or nothing, since document trees are data and `number` is only a claim. This covers `html`, `email` (whose `heading` once interpolated `level` into the tag name) and `svg` (where a non-numeric spacer string-concatenated into every later coordinate). Test with a parse (no `on*` attribute in the output), not a substring check. Lock: `tests/renderer-attribute-breakout.test.ts`.

---

### A rest-args factory where siblings take an array

`s.union` accepts both `s.union(a, b)` and `s.union([a, b])` (`args.length === 1 && Array.isArray(args[0])` is unambiguous because a schema is never an array), and rejects non-schema or too few members at construction with a `[Pyreon]` message instead of a crash deep in parse. Differential fuzzers need a wide schema grammar, not only a wide input grammar. Reference: `packages/fundamentals/validate/src/composition/union.ts`; lock `src/tests/union-call-forms.test.ts`.

---

### Detecting a schema by a vendor method or by `typeof === 'object'`

Detect Standard Schemas by `~standard.validate`, and gate the duck-type on `typeof value === 'object' || typeof value === 'function'` — ArkType's `type(...)` is a callable carrying `~standard`. Keep the brand check strict so a plain function still fails. `isStandardSchema` (`packages/fundamentals/validation/src/schema.ts`) implements this; `@pyreon/feature`'s `createValidator` and `@pyreon/form`'s `resolveSchemaValidator` check it before any Zod-specific or bare-function branch. Field introspection (`extractFields`) remains Zod-only, so a non-Zod feature dev-warns and needs explicit `initialValues`. Test with the real callable library, not a mock object. Locks: `validation/src/tests/callable-standard-schema.test.ts`, `feature/src/tests/schema-validators.test.tsx`.

---

### Discriminating a Standard Schema result on `'value' in r`

Valibot's failure result carries both `value` (the raw input) and `issues`, so a `'value' in r` check turns a raw valibot schema into a validation no-op that writes invalid data into store state. Failure iff `issues` is a non-empty array. `wrapStandardSchema` mirrors `standardSchemaToValidator` in the same file. Consumer tests of raw Standard Schemas run the full raw-library matrix (zod, valibot, arktype) because each library's result shape differs. Reference: `packages/fundamentals/validation/src/schema.ts:wrapStandardSchema`; lock `src/tests/standard-schema-result-discriminant.test.ts`.

---

### Reading observable properties in an `@Observable` class's `init`

The macro turns a read of `self.x` into an observation registration. When `init` runs inside a SwiftUI view's init, SwiftUI rebuilds the view, constructs a second instance, discards it, and the discarded instance's `deinit` releases process-wide state (for `PyreonRouter`: the deep-link listener, so warm links were dropped). Compute from local parameters only; make helpers `static` and pass values in (`initialPathAllowed`, `resolveChainInStatic` in `packages/native/router-swift/Sources/PyreonRouter/PyreonRouter.swift`). XCTest has no observation context, so only an on-device XCUITest that asserts a warm deep link catches it: `examples/native-router-demo-ios/iosUITests/PyreonRouterDemoUITests.swift:test_deepLinkOpensTheRouteColdAndWarm`.

---

### Release verification by sentinel, publish with no resume

Rules for release tooling:
  1. `check-published-state` sweeps every published package against npm (`classifyLag`); a sample of sentinels is not a measurement.
  2. `publish-retry` retries only evidence-based transient failures (5xx, dropped sockets) — never 404 (missing Trusted Publisher), 403, the cannot-publish-over conflict (already published), or `E422 Error verifying sigstore provenance bundle`, which is deterministic (for example an empty `repository.url` in the tarball manifest).
  3. An idempotent publish still needs a resume trigger: release.yml `resume-detect`/`resume-publish` rebuild from the release tag, never main, and attempt once per version before warning, since a tag-replay cannot fix a release broken by its own tag.
  Locks: `packages/internals/test-utils/src/tests/{check-published-state,publish-retry}.test.ts`.

---

### A timeout gate that scans one workflow

`scripts/check-ci-job-timeouts.ts` scans every file in `.github/workflows/`; without `timeout-minutes` a job runs on GitHub's 6-hour default and a hung job holds one of the org's 20 runner slots. The parser skips the nested `on:` keys and accepts a `${{ … }}` expression as a declared budget. A gate's input set is a claim; a narrow one is silently false outside it.

---

### Using an own-key count as a membership test

`@pyreon/validate`'s `.strict()` emitters once short-circuited on `Object.keys(x).length === N`, but field checks read through the prototype chain, so a prototype-carried object and a typo'd key in place of a real one both slipped past the unknown-key scan. The short-circuit must prove each declared key is in `Object.keys(x)`: use `Object.prototype.propertyIsEnumerable.call` (own and enumerable), not `Object.hasOwn`, which also matches non-enumerable own keys. When optimizing a predicate, name what the cheap version assumes and what code establishes it. When two emitters share one predicate, a fuzz whose oracle is their agreement (`is() === parse().ok`) cannot catch it; differential-test against the interpreter. Reference: `packages/fundamentals/validate/src/core/jit.ts:strictShortCircuitMiss`; locks `src/tests/strict-prototype-keys.test.ts`, the schema-paired fuzz in `src/tests/jit-check-differential.test.ts`, and the `.strict()` block in `src/tests/jit-differential.test.ts`.

---
