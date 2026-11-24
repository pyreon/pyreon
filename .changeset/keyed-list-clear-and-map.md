---
'@pyreon/reactivity': patch
'@pyreon/runtime-dom': patch
---

Faster keyed lists whose rows hold conditional JSX, and a keyed `.map()` that no longer leaks.

- Clearing or replacing a `<For>` (or keyed `.map()`) list that owns its parent no longer removes each row's conditional cell and marker from the live DOM one by one before the parent is emptied in a single call. Clearing 1,000 such rows in real Chromium: 485–525 µs to 270–275 µs.
- The effect behind a conditional cell (`mountReactive`) and a list (`mountFor`) is owned by the cleanup it is returned to, not also by the ambient `EffectScope` (new internal `_effectOwned`). A `<For>` row with a conditional cell no longer keeps an `EffectScope`, an array and a closure of its own.
- A keyed `.map()` row is now mounted inside its row's ownership window. Before, what the row's template handed to the scope went to the component's scope on the first render (kept, with the removed row, until the component unmounted) and to no scope on later updates, where it was never disposed.
- A compiled component-child template item is one object instead of an object, two closures and six accessor closures. A keyed `.map()` re-creates every row's items on each list change and keeps only the new keys, so swapping two rows of 1,000 spent 85% of its time building items it threw away (1.48 ms to 0.84 ms).
