---
title: "Library API-Shape Mistakes"
description: "Common library api-shape mistakes in Pyreon and how to fix them."
---

# Library API-Shape Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

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

A 27-package audit of `packages/fundamentals` (PRs #3642–#3653) found the same few shapes in many packages. Each entry names the class once; the per-package fixes live in those PRs.

---

### Setup-time `onCleanup` had no owner

`onCleanup` registers only while a collector window is open, and only effect runs opened one. Called during component setup it was DROPPED at a root mount, or CAPTURED by the enclosing `<For>`/`<Show>` effect, so adding one row ran the cleanups of rows still on screen. `onCleanup` inside `onMount` was dropped the same way. **Fix (#3653)**: `runWithHooks` and `EffectScope.runInScope` open their own frame (save-then-restore, never reset to a constant) and hand what they collect to the owner's unmount. **Rule: every owner that should receive registrations must open the window itself; a collector only effects open is a collector nothing else can reach.**

---

### Plain-object records keyed by user data hit `Object.prototype`

`groupBy` on a key `constructor` threw, `keyBy` on `__proto__` replaced the prototype, `machine.send('toString')` moved to an `undefined` state, and an error for a field named `constructor` read as already present so the form reported VALID. Six packages had it. **Fix**: `Object.create(null)` for records built from user keys, `Object.hasOwn` for lookups. **Rule: any object whose keys come from data (field names, event names, locale ids, store ids) must not inherit.**

---

### An async gate that attaches its listener after the `await`

`sync`'s relay attached `socket.on('message')` after `await authorize()`, so the client's first frame was lost and a late joiner never synced. **Fix**: listen immediately, buffer until the gate decides, bound the buffer, replay or drop. The same bug class covers a `ws` server socket with no `error` listener, where one malformed frame kills the process.

---

### Inbound cross-tab updates written through the persisting setter

`storage`'s `storage`-event handler set the persisting wrapper, which wrote the value back and undid another tab's removal; it also ignored `key === null`, which is `localStorage.clear()`, so "log out everywhere" left tokens in memory. **Rule: apply external state to the underlying signal, never the persisting wrapper; treat a null key as a clear.**

---

### Request dedupe keyed without credentials, and an abort link released at the headers

`http`'s default dedupe key was `METHOD url`, so two users' concurrent requests shared one response under SSR; separately, the abort/timeout link was cleaned up when headers arrived, so neither covered reading the body. **Rule: a shared in-flight key must include whatever makes the response user-specific; request lifetime ends when the body is consumed, not at the headers.**

---

### Chainable builders that push and `return this`

`validate`'s `.min()`/`.max()` mutated the schema they were called on, so a shared base schema changed under every schema built from it, and a JIT cache made the result depend on parse order. **Rule: builder methods return a copy with the new op (copy-on-write); `withField`-style metadata helpers wrap, never write into the argument.**

---

### Interpolate first, parse markup second

`i18n`'s `<Trans>` substituted `{{values}}` before parsing its `<tag>` syntax, so a user value could open a real component call. **Rule: parse the template's structure before any value can add to it.** Same family as `document`'s renderers trusting hrefs from a shared inline-link helper — sanitize where the data is produced, with a scheme ALLOWLIST checked after stripping control characters and decoding entities.

---

### A reset that clears values but not in-flight work

`form`'s `reset()` left the async-validation version counter unchanged, so a validator that resolved afterwards wrote its error onto the now-empty field. Related in the same package: a submit guard set after the first `await` let a double Enter submit twice, and an event-bound handler that rethrows produces an unhandled rejection because nothing awaits it. **Rules: reset bumps every version/abort token it owns; a re-entrancy guard is set synchronously before the first `await`; a handler bound to a DOM event must not rethrow.**

---

### An element getter read once, before the element exists

`dnd`'s hooks, `useEventListener` (which then fell back to `window`), `useIntersection`, `useElementSize` and `virtual` read their element getter once at setup or on a microtask, so an element behind `<Show>` or mounted later was never registered, with no warning. **Rule: resolve at mount or accept a ref callback, re-resolve on swap, and dev-warn when a target was requested but is still null.**

---

### Pointer gestures without an owner or a cancel path

`flow`'s node drag had no `pointercancel`/`lostpointercapture` handling and did not track the pointer id, so an OS-interrupted touch drag stayed live and an unrelated later pointer moved the node. **Rule: a gesture records its `pointerId`, ignores other pointers, and ends — uncommitted — on cancel or lost capture.**

---

### `setTimeout` delays above 2³¹−1 ms fire immediately

`toast`'s `duration: Infinity` dismissed after ~1ms, and `query`'s uncapped exponential reconnect backoff passed the limit and turned into a reconnect storm. **Rule: cap and jitter every computed delay; treat a non-finite duration as "never", not as a number.**

---
