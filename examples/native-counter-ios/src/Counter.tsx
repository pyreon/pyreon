// The canonical PMTC counter — proves the signal → @State round-trip
// works end-to-end. Per PMTC Phase 0 success criterion 2.
//
// On iOS this compiles to a SwiftUI struct with `@State private var
// count: Int = 0`, displays "Count: \(count)", and increments on
// button tap. SwiftUI's automatic re-render fires when count changes
// via `count.set(...)` (the compiler emits as `count = ...` since
// SwiftUI's @State is a var, not a method).

import { signal } from '@pyreon/reactivity'
import { useHaptics } from '@pyreon/hooks'

export function Counter() {
  const count = signal<number>(0)
  // M3.1 platform-API proof — a haptic fires on each increment tap.
  // Native: iOS `PyreonHaptics().impact("light")` (UIImpactFeedbackGenerator),
  // Android `PyreonHaptics(LocalHapticFeedback.current).impact("light")`.
  // Web: `navigator.vibrate(10)`. No observable UI (haptics are physical),
  // so the device gate proves "builds + runs + the tap does not crash".
  const haptics = useHaptics()
  return (
    <VStack>
      <Text>Count: {count}</Text>
      <Button
        onClick={() => {
          count.set(count() + 1)
          haptics.impact('light')
        }}
      >
        Increment
      </Button>
      {/* M2.3 gesture proof — a long-press-only <Press> resets the count.
          Native: iOS `.onLongPressGesture { count = 0 }`, Android
          `combinedClickable(onLongClick = { count = 0 })`. Web: 500ms
          pointer-down polyfill (already in @pyreon/primitives). */}
      <Press onLongPress={() => count.set(0)} data-testid="reset-zone">
        <Text>Hold to reset</Text>
      </Press>
    </VStack>
  )
}
