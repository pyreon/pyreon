---
'@pyreon/core': minor
'@pyreon/rocketstyle': patch
'@pyreon/validate': patch
'@pyreon/feature': patch
'@pyreon/document-primitives': patch
---

Published type declarations now compile strictly (`skipLibCheck: false`), and no longer degrade to `any` under the default `skipLibCheck: true`.

- `@pyreon/core`: component props may be a plain `interface`. `ComponentFn`, `defineComponent`, `lazy`, `Defer`, `HigherOrderComponent` and `h()` bounded props by `Record<string, unknown>`, which an interface does not satisfy (no implicit index signature). `ComponentFn<ButtonProps>` was TS2344, and every `@pyreon/elements` props type violated the bound once emitted into a `.d.ts`. The bound is now `object`; `Props` is unchanged.
- `@pyreon/rocketstyle`: the origin-props parameter of `RocketStyleComponent` accepts interface-typed props for the same reason.
- `@pyreon/validate`: `s.string().iso.date()` / `.dateTime()` / `.time()` returned `any` to consumers. The inferred type put polymorphic `this` inside an object type literal, which is invalid in a declaration file. It is now typed as the named `IsoChecks<this>`, and the chain stays typed.
- `@pyreon/feature`: its declarations import `@tanstack/table-core`, which it now declares as a dependency. Before, the import resolved only where the package manager hoists transitive dependencies.
- `@pyreon/document-primitives`: declares `@pyreon/ui-core`, which its declarations import.
