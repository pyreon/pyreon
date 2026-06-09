// Tier-2 Strategy-B v1 fixture for @pyreon/state-tree (Gap 4 follow-up).
//
// FOUNDATION PR — establishes the runtime port skeleton + diagnostic
// (renames the silent-drop from `createModel` → `model` to match the
// actual public export). The v2 follow-up PR will add real per-target
// emit; this fixture exists as the canonical source shape that future
// emit work must compile cleanly to swiftc/kotlinc.
//
// v1 SHAPE — captured for future emit:
//   - `model({ state: { ... literal ... } })` definition
//   - `.create()` no-arg instantiation
//   - String / number / boolean state values
//   - Reactive field reads on the instance
//
// v2+ deferred:
//   - `actions: { methodName() { ... } }` action methods
//   - `views: { viewName() { ... } }` derived accessors
//   - `.create(initialOverride)` custom initial state
//   - `.asHook(id)` singleton hook form
//   - `getSnapshot` / `applySnapshot` / `onPatch` / `applyPatch`

import { model } from '@pyreon/state-tree'
import { Stack, Text } from '@pyreon/primitives'

// Inline model + create pattern — single decl, cleaner shape for v1
// emit recognition. The two-step form (`const Counter = model(...);
// const counter = Counter.create()`) is a follow-up.
const counter = model({ state: { count: 0, label: 'counter' } }).create()

export function ModelView() {
  return (
    <Stack>
      <Text>{counter.label}</Text>
      <Text>Count: {counter.count}</Text>
    </Stack>
  )
}
