// The canonical PMTC counter — proves the signal → @State round-trip
// works end-to-end. Per PMTC Phase 0 success criterion 2.
//
// On iOS this compiles to a SwiftUI struct with `@State private var
// count: Int = 0`, displays "Count: \(count)", and increments on
// button tap. SwiftUI's automatic re-render fires when count changes
// via `count.set(...)` (the compiler emits as `count = ...` since
// SwiftUI's @State is a var, not a method).

import { signal } from '@pyreon/reactivity'

export function Counter() {
  const count = signal<number>(0)
  return (
    <VStack>
      <Text>Count: {count}</Text>
      <Button onClick={() => count.set(count() + 1)}>Increment</Button>
    </VStack>
  )
}
