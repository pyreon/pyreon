---
"@pyreon/validation": patch
---

fix(validation): discriminate Standard Schema results on `issues`, never on `'value' in r`

`wrapStandardSchema` (the internal bridge behind `extractParseFn`) discriminated SUCCESS on the presence of a `value` key — but the Standard Schema spec's discriminant is `issues` ("if `issues` is undefined, validation succeeded"), and **valibot's FAILURE result carries BOTH** (`{ typed: false, value: <raw input>, issues: [...] }`).

Consequence: a RAW valibot schema (Tier A.2 — passed directly, no `valibotSchema()` adapter) driving a schema-mode `defineStore({ schema })` (`@pyreon/store`) or `model({ schema })` (`@pyreon/state-tree`) was a **silent validation no-op** — `extractParseFn(v.object({ age: v.number() }))({ age: 'nope' })` returned `{ ok: true, value: { age: 'nope' } }`, so an invalid `set`/`patch` did NOT throw and wrote the raw invalid value into state (data corruption). Raw zod / arktype were unaffected (their failure results carry no `value` key); `@pyreon/form`/`@pyreon/feature` were unaffected (they route through `standardSchemaToValidator`, which already checked `issues` first).

The discriminant now mirrors the proven-correct `standardSchemaToValidator`: failure iff `issues` is a non-empty array, success otherwise. The bug dates to the package's inception (#910); it slipped because store/state-tree schema suites exercised raw ARKTYPE + the valibot ADAPTER, never raw VALIBOT (the "real library, one lib short" trap). Regression coverage now runs the full raw-library matrix (valibot + zod + arktype) at both the bridge and store/state-tree end-to-end levels.
