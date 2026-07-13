// The canonical PMTC counter — proves the signal → @State round-trip
// works end-to-end. Per PMTC Phase 0 success criterion 2.
//
// On iOS this compiles to a SwiftUI struct with `@State private var
// count: Int = 0`, displays "Count: \(count)", and increments on
// button tap. SwiftUI's automatic re-render fires when count changes
// via `count.set(...)` (the compiler emits as `count = ...` since
// SwiftUI's @State is a var, not a method).

import { signal } from '@pyreon/reactivity'
import { useHaptics, useShare, useLinking, useNotifications, useSizeClass } from '@pyreon/hooks'

export function Counter() {
  const count = signal<number>(0)
  // M3.1 platform-API proof — a haptic fires on each increment tap.
  // Native: iOS `PyreonHaptics().impact("light")` (UIImpactFeedbackGenerator),
  // Android `PyreonHaptics(LocalHapticFeedback.current).impact("light")`.
  // Web: `navigator.vibrate(10)`. No observable UI (haptics are physical),
  // so the device gate proves "builds + runs + the tap does not crash".
  const haptics = useHaptics()
  // M3.2 platform-API proof — a Share button opens the system share sheet.
  // Native: iOS `PyreonShare().url(...)` (UIActivityViewController from the
  // key window), Android `PyreonShare(ctx).url(...)` (Intent.createChooser).
  // Web: `navigator.share({ url })`. UNLIKE haptics this IS observable — the
  // share sheet appears — so the device gate asserts the sheet exists.
  const share = useShare()
  // M3.2b platform-API proof — an Open button opens an external URL.
  // Native: iOS `PyreonLinking().openUrl(...)` (UIApplication.shared.open),
  // Android `PyreonLinking(ctx).openUrl(...)` (Intent.ACTION_VIEW). Web:
  // `window.open`. Observable — tapping it backgrounds the app / foregrounds
  // Safari — so the device gate asserts the app leaves the foreground.
  const linking = useLinking()
  // M3.3 platform-API proof — a Notify button posts a local notification.
  // Native: iOS `PyreonNotifications().notify(...)` (UNUserNotificationCenter),
  // Android `PyreonNotifications(ctx).notify(...)` (NotificationManager +
  // channel). Web: Notification API. R4 asserts the tap does not crash
  // (the banner + permission prompt make a full behavioral assert flaky).
  const notifs = useNotifications()
  // M2.2 adaptive proof — the current horizontal size class, read reactively.
  // Native: iOS `@Environment(\.horizontalSizeClass)` → "compact"/"regular",
  // Android `LocalConfiguration.current.screenWidthDp >= 600`. Web:
  // `matchMedia('(min-width: 600px)')`. OBSERVABLE + differentiating — the
  // device gate asserts `Size: compact` on an iPhone (and `Size: regular`
  // on an iPad locally), proving the read reflects the REAL environment.
  const sizeClass = useSizeClass()
  return (
    <VStack>
      <Text>Count: {count}</Text>
      <Text>Size: {sizeClass}</Text>
      <Button
        onClick={() => {
          count.set(count() + 1)
          haptics.impact('light')
        }}
      >
        Increment
      </Button>
      <Button onClick={() => share.url('https://pyreon.dev')}>Share</Button>
      <Button onClick={() => linking.openUrl('https://pyreon.dev')}>Open</Button>
      <Button onClick={() => notifs.notify('Pyreon', 'A local notification')}>Notify</Button>
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
