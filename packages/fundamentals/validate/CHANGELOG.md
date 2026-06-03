# @pyreon/validate

## 0.28.1

### Patch Changes

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@1.0.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@1.0.0

## 0.26.3

## 0.26.2

## 0.26.0

### Minor Changes

- [#966](https://github.com/pyreon/pyreon/pull/966) [`77ba200`](https://github.com/pyreon/pyreon/commit/77ba200143f6092bbea41737e86612f6a75ed8bf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): chainable `.toLowerCase()` / `.toUpperCase()` / `.trim()` on StringSchema + coverage hardening (closes BELOW_FLOOR_EXEMPTIONS)

  The validator's `core/ops.ts` declared `Op` kinds for `to-lower-case`/
  `to-upper-case`/`trim` from v1 (PR [#952](https://github.com/pyreon/pyreon/issues/952)) but never exposed chainable
  methods for them — the gap that drove the temporary `BELOW_FLOOR_EXEMPTIONS`
  entry for `@pyreon/validate` at 80/75/80 vs the 90/85/90 fundamentals
  floor. This PR ships the missing chainable surface AND lifts coverage
  from 83.58 → 98.69% statements / 78.38 → 94.3% branches / 83.21 → 98.6%
  functions via 46 additional bisect-targeted tests across the string
  transforms + `pipe()` invocation paths + uncovered-but-typed branches
  in number/array/object/schema/issue.

  What changes for users:

  ```ts
  import { s } from "@pyreon/validate";

  // New: declarative case + whitespace transforms — applied before any
  // further checks, so `.trim().min(3)` works the way it reads.
  const handle = s.string().trim().toLowerCase().min(3);
  handle.parse("  Alice  "); // → { ok: true, value: 'alice' }
  ```

  Internally these are `{ kind: 'transform', fn }` ops with the same
  compile-once-cached-thereafter contract as `.transform(fn)` — no new
  hot-path cost.

  Coverage exemption + lowered vitest thresholds removed in the same PR;
  `@pyreon/validate` now sits at the fundamentals 90/85/90 floor with
  significant headroom.

- [#952](https://github.com/pyreon/pyreon/pull/952) [`c288ea4`](https://github.com/pyreon/pyreon/commit/c288ea4a5356d7c0bb92a32914a2243a5c6e1311) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): Pyreon's own validator library — Standard Schema-native, hybrid chainable + function-comp API

  **This is a major rev that turns `@pyreon/validate` from a DX overlay (its previous shape — `withField` / `parseReactive` / `formatErrors` only) into a full Pyreon-owned validator runtime. The DX layer stays — it now works on top of Pyreon's own schemas AND any other Standard Schema validator (Zod 3.24+, Valibot 1.0+, ArkType 2.0+, typia, etc.).**

  ## What ships

  ### Hybrid API surface — chainable + function-comp

  ```ts
  // Chainable (Zod-like, familiar):
  import { s } from "@pyreon/validate";

  const userSchema = s.object({
    name: s.string().min(2).max(50).field({ label: "Name" }),
    email: s.string().email().field({ i18nLabel: "auth.email" }),
    age: s.number().int().between(0, 150).optional(),
  });

  type User = s.Infer<typeof userSchema>;

  // Function-comp (Valibot-like, tree-shake-friendly):
  import {
    object,
    string,
    number,
    email,
    min,
    max,
    int,
    between,
    optional,
  } from "@pyreon/validate";

  const userSchema = object({
    name: string().min(2).max(50).field({ label: "Name" }),
    email: string().email().field({ i18nLabel: "auth.email" }),
    age: number().int().between(0, 150).optional(),
  });
  ```

  Both produce identical schema instances. Internally a single `Schema<T>` class with an `_ops` list; chainable methods append; the compiler turns the ops into a single closure on first parse — chain-friendly DX, no method-dispatch cost per parse.

  ### v1 surface

  - **Primitives**: `string`, `number`, `boolean`, `literal`, `enum` (exported as `enum_` to avoid the reserved-word collision; `s.enum` alias works)
  - **Composition**: `object`, `array`
  - **Modifiers**: `optional`, `nullable`, `nullish`, `default`, `transform`, `refine`, `brand`, `describe`, `field`
  - **String checks**: `min`, `max`, `length`, `nonEmpty`, `regex`, `email`, `url`, `uuid`, `iso.date`, `iso.dateTime`, `iso.time`, `startsWith`, `endsWith`, `includes`
  - **Number checks**: `min`, `max`, `int`, `finite`, `positive`, `negative`, `nonNegative`, `nonPositive`, `between`, `multipleOf`
  - **Array checks**: `min`, `max`, `length`, `nonEmpty`
  - **Parse entry points**: `.parse(input)` → `Result<T, Issue[]>` (no throw); `.parseOrThrow(input)` → `T` (throws `ValidationError`); `.safeParse(input)` (Zod-compat alias); `.parseAsync(input)` for async refines; `~standard.validate(input)` for Standard Schema interop
  - **Type helpers**: `Infer<S>`, `Input<S>`, `Output<S>`
  - **DX layer (unchanged from prior shape)**: `withField` / `getMeta` / `resolveMetaField`, `parseReactive` / `parseReactiveAsync` / `watchValid`, `formatError` / `formatErrors` / `formatErrorsByPath`

  ### Standard Schema-native

  Every schema implements `StandardSchemaV1` directly. This means:

  - Existing `@pyreon/form` (which accepts StdSchema via `bindSchema()` in `@pyreon/validation`) works with Pyreon-validate schemas with zero adapter overhead.
  - DX helpers (`withField` / `parseReactive` / `formatErrors`) work on Pyreon-validate schemas AND any other StdSchema validator — full backward compat for users who already have Zod / Valibot / ArkType schemas.
  - A future compiler-emit PR can target any Standard Schema validator (Pyreon-validate or external) — the `_compiled` sidecar contract is generic.

  ### Issues carry i18n keys natively

  Every built-in check emits issues with pre-populated `code` / `key` / `params` / `fallback`. `s.string().min(2).parse('a')` produces:

  ```ts
  {
    ok: false,
    issues: [{
      code: 'too_small',
      key: 'validate.string.too-short',
      params: { min: 2, actual: 1 },
      fallback: 'Must be at least 2 characters',
      message: 'Must be at least 2 characters',
      path: [],
    }]
  }
  ```

  Apps pipe `result.issues` through `formatErrors(issues, t)` from `@pyreon/i18n` to get translated strings.

  ### Tests + validation

  - **113 tests** covering primitives × checks × composition × modifiers × parse paths × hybrid-API parity × cross-lib StdSchema compat (Pyreon-validate schemas plugged into `@pyreon/validation`'s `wrapStandardSchema`).
  - **Typecheck + lint + repo-wide gates** all green.
  - **3 bisect-verified specs**: string type-check disabled → 4 specs fail; optional/nullish modifier prelude disabled → 4 specs fail; object unknown-key stripping disabled → 1 spec fails.
  - Bundle size **4.41 KB gz** (locked at 5.5 KB with 25% headroom).

  ### Out of scope (deliberate v1 deferrals)

  - **PR [#2](https://github.com/pyreon/pyreon/issues/2) — Compiler-emit.** `@pyreon/compiler:analyzeValidate()` emits typia-class specialized validators per schema at build time, working against any Standard Schema validator. Plan documented in `.claude/plans/synchronous-chasing-puffin.md`.
  - **PR [#3](https://github.com/pyreon/pyreon/issues/3) — Composition surface.** `tuple`, `record`, `union`, `discriminate`, `intersection`; primitive `date`, `bigint`, `null`/`undefined`/`void`; modifiers `.pick`, `.omit`, `.partial`, `.required`, `.extend`, `.merge`, `.coerce`.
  - **PR [#4](https://github.com/pyreon/pyreon/issues/4) — `@pyreon/feature` migration.** `defineFeature` defaults to Pyreon-validate schemas; existing Zod adapter remains.
  - **PR [#5](https://github.com/pyreon/pyreon/issues/5) — `@pyreon/zero` loader integration.** Loaders / search-param validators take Pyreon-validate or any StdSchema directly.

  ## Supersedes PR [#952](https://github.com/pyreon/pyreon/issues/952)

  PR [#952](https://github.com/pyreon/pyreon/issues/952) introduced `@pyreon/validate` as a DX-only overlay on top of any Standard Schema validator. This PR keeps every line of that DX code (it's verbatim — `withField` / `parseReactive` / `formatErrors` and their 53 tests) AND adds the actual validator runtime. PR [#952](https://github.com/pyreon/pyreon/issues/952) is closed in favor of this PR.

### Patch Changes

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@1.0.0
