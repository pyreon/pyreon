---
'@pyreon/native-compiler': patch
---

A struct is now selected by field names AND field types, not names alone.

The emitters resolve an object literal or object type to a declared struct of
the same shape, so a prop typed `{ id, text, done }` and the literal that builds
it agree on one nominal type. That resolution keyed on field NAMES only and kept
the first struct registered, so two declared types sharing a shape collapsed:

```ts
type Px  = { x: Double; y: Double }
type Idx = { x: number; y: number }
const i: Idx = { x: 1, y: 2 }   // emitted Px(x: 1, y: 2)
```

Silent where the field types coerce, and a hard `cannot convert value of type
'Double' to expected argument type 'Int'` where they do not. It blocks any
geometry code, where a point, an anchor, an offset and a tick position are all
`{ x, y }`.

The literal side derives its key from its own values and falls back to the
name-only lookup whenever a value's type is not locally decidable, so this only
ever adds a correct match. Both emitters share one `structShapeKey`, so they
cannot disagree about which struct a shape resolves to.
