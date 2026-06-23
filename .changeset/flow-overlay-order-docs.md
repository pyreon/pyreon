---
"@pyreon/flow": patch
---

Document the overlay child-order requirement on `<Controls>` and `<MiniMap>`: place `<MiniMap>` before `<Controls>` in `<Flow>` children. A `<Controls>` mounted as a sibling before a `<MiniMap>` currently fails to render (a known framework slot-ordering limitation — the instance resolves but the DOM is never mounted). Added `@remarks` JSDoc to both components and an "Overlay child order" section to the docs. No runtime change.
