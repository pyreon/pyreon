---
'@pyreon/rx': minor
'@pyreon/machine': minor
'@pyreon/permissions': minor
'@pyreon/i18n': minor
'@pyreon/url-state': minor
'@pyreon/table': minor
'@pyreon/native-compiler': patch
'@pyreon/atlas': patch
---

Hardening pass across six fundamentals packages.

**@pyreon/rx** — `groupBy` / `keyBy` / `countBy` / `mapValues` now build prototype-free records (`Object.create(null)`). A key named `constructor` made `groupBy` throw and `countBy` produce `'function Object() …1'`; a `__proto__` key was written as the result's prototype and vanished. Behaviour change: the results no longer inherit from `Object.prototype` (call `Object.hasOwn(result, k)`, not `result.hasOwnProperty(k)`). `search()` gains signal/plain overloads (a plain call is typed `T[]`, a signal call a computed) instead of `any`.

**@pyreon/machine** — event and state names are looked up as OWN keys, so `send('toString')` is an unhandled event instead of moving the machine into an undefined state; an initial/target named after an `Object.prototype` member is rejected at creation. A throwing `onExit` / `onEnter` / `onTransition` / `onDone` listener is reported (`console.error`, `[Pyreon]` prefix) and no longer aborts the transition midway. Behaviour change: `send()` called from inside a listener is QUEUED and runs after the current macrostep completes (run-to-completion), instead of running nested in the middle of it; such a call returns the state as it is at that moment.

**@pyreon/permissions** — behaviour change: `usePermissions([])` is a self-contained deny-all instance; it no longer falls back to the provider's instance (the mode is chosen by the presence of the argument, not its length). The native lowering makes the same choice. The resolve memo is re-enabled once `patch()` replaces the last predicate with a boolean. `can.all` / `can.any` accept an array plus a context (`can.all(['a', 'b'], post)`) so multi-checks reach context-dependent predicates; the rest-args form is unchanged.

**@pyreon/i18n** — `<Trans>` no longer lets an interpolated value create markup: angle brackets in values are neutralised before tags are parsed, so `x</bold><link>…` renders as text instead of invoking the `link` component. Loader-returned namespaces get the same normalization as `messages` (flat dotted keys expanded, unsafe keys dropped, a store-owned deep copy). Behaviour change: locales resolve along the BCP 47 step-down chain (`en-US` → `en` → `fallbackLocale`, itself stepped down). Key paths, inline format names and custom plural rules are OWN-property lookups (`t('a.constructor.name')` no longer returns `'Object'`). `$t()` nesting no longer re-interpolates a nested result, so a value that looks like `{{x}}` is not substituted twice. The `Intl.PluralRules` cache and the per-instance resolution cache are LRU-bounded (the resolution cache used to stop caching entirely after 2000 keys).

**@pyreon/url-state** — signals now follow navigations made through the registered router (`router.push('?page=2')`, `<RouterLink>`), including a router registered after the signal was created (`UrlRouter` gains an optional `currentRoute`, which `@pyreon/router` already provides). Behaviour changes: array params keep their element type, inferred from the default's first element (`[0]` → `number[]`), and a `,` inside an element round-trips; a lone custom `serialize` or `deserialize` is honoured (the other half is inferred), and with `arrayFormat: 'repeat'` a custom codec applies per element; `onChange` fires only when the value actually changed; an empty number param (`?page=`) and an unrecognised boolean fall back to the default, and booleans accept `1`/`0`. The native lowering decodes empty numbers and booleans the same way.

**@pyreon/table** — `flexRenderCell` tracks the cell renderer itself (the lookup stays untracked), so a renderer reading table state such as `info.row.getIsSelected()` updates on that change; data edits still re-run only the edited row. `columnSignature` covers group columns' children and the `cell` / `header` / `footer` renderers (by source text, so an inline column literal stays stable), so a renderer swap re-renders the cells. Cleanup is registered on the owning `EffectScope` instead of `onUnmount`, so `useTable` in a store no longer warns.

**@pyreon/atlas** — the permission-set recorder wraps the new array form of `can.all` / `can.any` too, so keys passed that way are seeded with the role's policy and recorded as consulted.
