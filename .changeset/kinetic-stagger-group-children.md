---
'@pyreon/kinetic': patch
---

Stagger and group modes work with the children the compiler emits. A stagger over literal children (`<li>Install</li>`, compiled to a pre-built element) rendered an empty container; it now renders and animates them, on the client and the server. Group mode and `<TransitionGroup>` keep one row per key: a removed row animates out and then unmounts, an added row enters, and rows that stay keep their element through a reorder. A group's `{() => items.map(…)}` children compiled from source no longer throw `children is not iterable`. A transition with `appear` no longer renders its element twice.
