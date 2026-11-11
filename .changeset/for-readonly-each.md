---
'@pyreon/core': patch
'@pyreon/runtime-dom': patch
---

`<For each>` accepts a readonly array: `each` is typed `readonly T[] | (() => readonly T[])`, so `as const` data, `readonly X[]` props and accessors returning a readonly array typecheck instead of failing with "The type 'readonly X[]' is 'readonly' and cannot be assigned to the mutable type 'X[]'". Mutable arrays are still accepted. Runtime behaviour is unchanged; runtime-dom's internal `mountFor` source is typed readonly to match.

Upgrade: none
