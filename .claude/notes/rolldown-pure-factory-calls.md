# Rolldown investigation — top-level factory calls + `sideEffects: false`

## TL;DR

**Not a Rolldown bug.** This investigation started from a report claiming `@pyreon/kinetic-presets` ships 113 unused presets to consumers' bundles. The symptom is real, the suggested cause (the `presets` aggregate object) is wrong, and the fix has to land **in the package** (`/* @__PURE__ */` annotations on factory calls) — not in Rolldown.

This document exists so that "Rolldown should fix this" is on the record as **considered and rejected**, with the evidence behind that call.

## What I measured

`@pyreon/kinetic-presets@0.24.0` exports ~135 entries, each defined as:

```ts
export const blurInUp: Preset = s(
  { opacity: 0, filter: 'blur(8px)', transform: 'translateY(16px)' },
  { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)' },
)
```

Package declares `sideEffects: false`. A consumer importing one preset (`import { blurInUp } from '@pyreon/kinetic-presets'`) ships **all 122** preset factory-call results.

Same behaviour across three bundlers:

| Bundler | Bundle size (consumer using 1 preset) | Presets shipped |
|---|---|---|
| Rolldown 1.0.2 (`minify: true, treeshake: true`) | **13,232 bytes** | 114 |
| esbuild (`--bundle --minify`) | **13,548 bytes** | 114 |
| Vite 8.0.13 (via Rolldown, prod build) | matches Rolldown | 114 |

After `/* @__PURE__ */` annotations on the 122 factory call sites in `presets.ts`:

| Bundler | Bundle size | Presets shipped |
|---|---|---|
| Rolldown 1.0.2 | **309 bytes** | 1 |
| esbuild | **324 bytes** | 1 |

**98% reduction** in the size attributable to `@pyreon/kinetic-presets`.

## Why isn't `sideEffects: false` enough?

This is the question the original report missed. The `sideEffects: false` field in `package.json` tells the bundler: "no top-level module evaluation has observable side effects you must preserve." It DOES enable some tree-shaking — for example, dropping an unused `import 'pkg/sideEffectModule'`. What it does **not** do is tell the bundler that a specific function call is pure.

Consider:

```js
const s = (h, v) => ({ h, v })
export const a = s({ opacity: 0 }, { opacity: 1 })
export const b = s({ opacity: 0 }, { opacity: 2 })
```

If a consumer imports only `a`, can the bundler safely drop the `s(...)` call that initialises `b`?

Looking at the source: yes, `s` is a pure arrow function returning a plain object. But the bundler doesn't statically know that. To prove it, the bundler would have to:

1. Look at the definition of `s`
2. Verify `s` does not read or write any global state
3. Verify `s` does not call any function whose purity isn't also known
4. Recursively, transitively
5. **Refuse to tree-shake if any of those checks fail**

This is **interprocedural purity analysis**. It's not impossible — Closure Compiler attempts it — but it's expensive, brittle, and has subtle false-positives. Worse: getting it wrong means **dropping a call that had a side effect the consumer expected**, which is silent breakage.

So Rolldown (and Rollup, esbuild, Webpack, Babel/Terser) all take the conservative position: **top-level function calls are assumed to have side effects unless explicitly annotated.** This is the same convention React, Vue, Solid, Preact, Lodash-es, date-fns, and every other major tree-shake-friendly library follows.

The annotation that "explicitly tells" the bundler a call is pure:

```ts
export const blurInUp = /* @__PURE__ */ s(hidden, visible)
```

Both `/* @__PURE__ */` (the long-standing UglifyJS / Babel / Terser / Rollup form) and `/* #__PURE__ */` (the newer Webpack / V8 form) are recognised by Rolldown.

## Could Rolldown be smarter?

In principle, yes. Three approaches:

### 1. Interprocedural purity inference

The bundler walks the call graph and proves `s` is pure. **What it would buy**: zero library-author burden — `export const x = s(...)` would tree-shake if `s` is provably pure.

**Why this hasn't shipped**: cost vs. benefit doesn't pencil out. The analysis is expensive (relative to bundling time), it gives up on common-but-hard shapes (closures over module state, conditional purity), and `@__PURE__` annotations already solve the problem for the cost of one comment per call. Library authors who care about tree-shaking already use them.

There is precedent for limited inference — Rollup has a [pure-functions option](https://rollupjs.org/configuration-options/#pure) where the user can list known-pure function names. Rolldown could expose the same. But it shifts the burden to the consumer, who is usually less qualified to make that call than the library author.

### 2. Pattern-based whitelist

Rolldown could recognise a pattern: a call where the callee is a local arrow function with `return <ObjectExpression>` and no other statements. Tree-shake it.

**Trade-off**: handles `s(h, v) => ({ h, v })` factories specifically, doesn't help anything more interesting (factories that compute intermediate values, factories that share defaults, factories from another file). False-negative-prone.

### 3. Annotation propagation

If the function declaration is annotated with `/* @__NO_SIDE_EFFECTS__ */`, all calls to it are treated as pure. Rolldown supports this annotation today. The package can use it:

```ts
/* @__NO_SIDE_EFFECTS__ */
const s = (h, v) => ({ enterStyle: h, ... })
```

This is **one annotation on the factory** instead of 122 annotations on the call sites. Functionally equivalent, less invasive. Adopted in the package as the actual fix.

## Why I'm shipping the package fix, not a Rolldown patch

1. **The annotation route works in every bundler in production today** — Rolldown, Rollup, esbuild, Webpack, Vite (via Rolldown), Bun, Parcel. Patching Rolldown only helps Vite + Rolldown consumers.
2. **Inference-based fixes have track record of subtle breakage** — see the Closure Compiler corpus, see Tree-shaker bug threads on github. Library annotations are explicit and audit-able.
3. **The fix is one comment per call site** — `/* @__PURE__ */` or `/* @__NO_SIDE_EFFECTS__ */` on the factory. Mechanical, reviewable, locked in by tests.
4. **It's the established convention.** Every library I'd ask "how do I tree-shake?" answers the same way. Diverging from convention would be confusing for downstream users.

## Reference

- Rolldown tree-shake docs: https://rolldown.rs/guide/in-depth/tree-shaking
- Rollup tree-shake docs: https://rollupjs.org/guide/en/#tree-shaking
- `@__PURE__` / `@__NO_SIDE_EFFECTS__` notation: https://rollupjs.org/configuration-options/#pure (similar in Rolldown)
- The actual fix lives in `packages/ui-system/kinetic-presets/src/presets.ts` (this PR).
