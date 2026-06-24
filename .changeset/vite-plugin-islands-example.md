---
'@pyreon/vite-plugin': patch
---

Correct the `islands` option's JSDoc `@example` for `hydrateIslandsAuto()`. It previously showed `hydrateIslandsAuto()` with no argument, which dereferences `undefined` at runtime; the example now imports the registry as a namespace (`import * as islands from 'virtual:pyreon/islands-registry'`) and passes it, and notes that a `@pyreon/zero` app doesn't need the call at all (islands self-hydrate).
