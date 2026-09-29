---
'@pyreon/native-compiler': minor
---

Lower three shapes that used to warn or fail on native:

- **Optional render props on SwiftUI.** `footer?: (n: number) => VNodeChild` / `header?: VNodeChild` is stored as an optional closure (`footer?(n)`), and the component gets one initializer per combination of provided optional slots, the omitted ones pinned to `EmptyView` by a constrained extension — so a caller that leaves the slot out compiles. A presence test narrows to the unwrapped closure, and forwarding the slot (`footer={props.footer}`) splits the call on presence. Past three optional slots in one component it still falls back to required, with a warning that says why. Compose already kept them nullable.
- **Block-bodied render callbacks and reactive-accessor returns.** `(u) => { const n = …; if (!u) return <A/>; return <B n/> }` lowers to view-builder statements on both targets (`let`/`val`, `if` / `if let`, the final view; `return null` renders nothing) instead of an empty view. A block with anything else — an assignment, a loop, a reassigned local — is still named.
- **A value and a type sharing a name.** `const Pet = s.object(…)` beside `type Pet = {…}` (or a `const` beside an `interface` / string-union alias, or a `defineFeature` binding) emitted `let Pet` beside `struct Pet` and failed with a redeclaration on both targets. The value is now renamed (`PetValue`, references included) and the type keeps its name. A local binding of the same name makes the rename unsafe and is reported instead.
