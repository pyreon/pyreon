---
'@pyreon/url-state': minor
---

Breaking: the `useUrlState` option `debounce` is renamed `debounceMs`, so the unit is in the name. The value is unchanged (milliseconds).

```ts
// before
const q = useUrlState('q', '', { debounce: 300 })
// after
const q = useUrlState('q', '', { debounceMs: 300 })
```

At runtime the old key is ignored: URL writes go out immediately, undebounced. TypeScript rejects `debounce` in an options literal; a JavaScript caller, or an options object TypeScript cannot check, now gets a dev-mode `[Pyreon] url-state` warning naming `debounceMs` (nothing is logged in production). The native compiler reports the old key by name too.

Upgrade: codemod url-state-debounce-ms (`pyreon upgrade` renames the key inside the options literal of every `useUrlState` call imported from `@pyreon/url-state`; a two-argument call whose first argument is not a literal is left for you, because its second argument may be a default value).
