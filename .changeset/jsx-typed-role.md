---
'@pyreon/core': minor
---

Type the `role` HTML attribute as a `AriaRole` union (new exported type)
instead of bare `string`. Gives `role="…"` literal autocomplete +
discoverability of the WAI-ARIA 1.2 role tokens, while the `(string & {})`
member keeps the union OPEN — any string still assigns (custom/abstract
roles, `role={dynamicString}`, future tokens), so this is a non-breaking
DX refinement, not a restriction (it does not type-error on typos). The
accessor form is `role={() => cond() ? 'tab' : undefined}`. Mirrors
React's `AriaRole`.
