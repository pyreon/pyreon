---
'@pyreon/validate': patch
---

`.strict()` no longer accepts an unknown key whose name exists on `Object.prototype`.

The unknown-key scan tested `key in known`, and `in` walks the PROTOTYPE CHAIN — so
`known` (a plain object holding the shape) reported `toString`, `constructor`,
`hasOwnProperty`, `valueOf`, `isPrototypeOf`, `propertyIsEnumerable` and
`toLocaleString` as KNOWN fields, and every one of them slipped through strict mode.
Rejecting unknown keys is the only thing `.strict()` does, and callers reach for it
precisely when unknown keys matter, so this defeated the feature for that set of
names.

`.catchall()` had the same bug from the same line: those keys were treated as known
and never validated against the catchall schema, so `catchall(s.string())` silently
accepted `{ toString: 123 }`.

Own-key membership (`Object.hasOwn`) is the correct predicate — a shape's OWN keys
are exactly its declared fields. A field genuinely NAMED `toString` still works.
