---
'@pyreon/state-tree': minor
'@pyreon/validation': patch
'@pyreon/store': patch
---

`@pyreon/state-tree` re-architected to mirror MobX-State-Tree's chainable `.views().actions()` shape, with first-class **schema validation** and **async actions out of the box**.

## BREAKING CHANGE

The single-config form `model({ state, views, actions })` is **REMOVED**. Use the chainable form:

```ts
// Before
model({
  state: { count: 0 },
  views: (self) => ({ doubled: () => self.count() * 2 }),
  actions: (self) => ({ inc: () => self.count.update(n => n + 1) }),
})

// After
model({ state: { count: 0 } })
  .views((self) => ({ doubled: () => self.count() * 2 }))
  .actions((self) => ({ inc: () => self.count.update(n => n + 1) }))
```

Migration is mechanical: `state` stays inside `model(...)`; `views` and `actions` keys move to chained `.views(...)` / `.actions(...)` calls verbatim. Behavior of each factory is unchanged. Empty `views: () => ({})` can be dropped.

## What's new

### Schema mode — `model({ schema, initial? })`

Accepts a `TypedSchemaAdapter` (`zodSchema(...)` / `valibotSchema(...)` / `arktypeSchema(...)`) OR a Standard Schema-compliant instance (zod 3.24+, valibot 1.0+, arktype 2.0+, Effect Schema, ...). Field types inferred end-to-end; every write validated through the schema.

Schema-mode instances expose **five validated mutation helpers** parallel to `@pyreon/store`'s `SchemaStoreApi`:

```ts
u.$set({ ...full })           // full replace, validated
u.$patch({ name: 'Bob' })     // shallow merge, validated
u.$deepPatch({ prefs: { theme: 'dark' } })  // recursive merge — keeps siblings
u.$update('items', items => items.filter(x => x.id !== id))  // transform one field
u.$reset()                     // restore parsed initial
```

Direct signal writes (`self.field.set(v)`) bypass validation by design — the documented escape hatch.

### Chainable `.views()` / `.actions()`

Each call returns a NEW `ModelDefinition` (immutable builder). Subsequent factories see prior views + actions via `self`. Order semantics: views run before actions in the lifecycle.

### Async actions — out of the box

Actions can be `async`; the runtime detects Promise returns and propagates them through the middleware chain. No `flow()` / `yield` wrapper. Middleware that wants completion does `await next(call)`.

## Step 0 — helper extraction (`@pyreon/validation` patch)

Moved schema-detection helpers from `@pyreon/store` to `@pyreon/validation` so both `@pyreon/store` (schema mode) and `@pyreon/state-tree` (schema mode) share them. New module: `packages/fundamentals/validation/src/schema.ts` exporting `extractParseFn`, `wrapStandardSchema`, `isPyreonAdapter`, `isStandardSchema`, `formatIssues`, `InferSchema<S>`, `SchemaIssue`, `SchemaParseResult<T>`, `StandardSchemaShape<T>`, `PyreonAdapterShape<T>`. `@pyreon/store` now imports from validation.

## Why patch on store (not minor)

The store change is purely an internal refactor — helpers moved out, public API unchanged. All 130 existing store tests pass without modification. Bundle shrinks slightly (helpers move out, validation grows by the same amount). Tagged as `patch` rather than `minor` because no consumer-visible surface changed.
