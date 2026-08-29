---
'@pyreon/native-compiler': patch
---

The accumulate-into-a-local shape now lowers to both targets:

```ts
const out: Tick[] = []
for (const n of names) { out.push({ label: n }) }
return out
```

Three things were wrong at once, and all three had to be fixed together for any
of them to matter. The declaration's type annotation was dropped, so the empty
literal had no element type — swiftc rejects that outright and Kotlin infers
`List<Nothing>`. `.push` had no mapping and emitted verbatim, and neither
target's array has one. And the mutability tracker only saw `=` and `++`, so a
local mutated only by pushing stayed immutable, which a Swift array rejects
because it is a value type.

Swift emits `var out: [Tick] = []` and `.append`; Kotlin emits
`val out: MutableList<Tick> = mutableListOf()` and `.add` — `val` is correct
there, since it is the list that mutates rather than the binding.

A non-empty literal is deliberately left unannotated: its elements already type
it, and annotating could only disagree with them.
