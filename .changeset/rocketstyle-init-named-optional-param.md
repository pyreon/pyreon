---
"@pyreon/rocketstyle": patch
---

fix(rocketstyle): use a named optional param in the `Rocketstyle` type instead of a destructuring pattern

The `Rocketstyle` function type declared its optional config as a destructuring pattern (`({ dimensions, useBooleans }?: {...})`). Binding-pattern names in a function type are documentary, but destructuring an OPTIONAL param makes some TypeScript builds report `Property 'dimensions' does not exist on type '{...} | undefined'` when this source is type-checked cross-package (e.g. `@pyreon/loom` importing rocketstyle) — which surfaces only when a rocketstyle dependency changes forces a re-typecheck. The runtime implementation already destructures with defaults, so this is a type-only, behaviour-preserving change (the param is now a named `config?`).
