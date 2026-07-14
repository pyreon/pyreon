// The canonical PMTC counter — proves the signal → @State round-trip
// works end-to-end. Per PMTC Phase 0 success criterion 2.
//
// On iOS this compiles to a SwiftUI struct with `@State private var
// count: Int = 0`, displays "Count: \(count)", and increments on
// button tap. SwiftUI's automatic re-render fires when count changes
// via `count.set(...)` (the compiler emits as `count = ...` since
// SwiftUI's @State is a var, not a method).

import { signal } from '@pyreon/reactivity'
import { useHaptics, useShare, useLinking, useNotifications, useSizeClass, useColorScheme } from '@pyreon/hooks'
import { createI18n } from '@pyreon/i18n/core'

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
  // Dark-mode proof — the current color scheme, read reactively. The sibling
  // of useSizeClass (both are reactive @Environment reads with NO runtime
  // port / NO permission). Native: iOS `@Environment(\.colorScheme)` →
  // "light"/"dark", Android `if (isSystemInDarkTheme()) "dark" else "light"`.
  // Web: `matchMedia('(prefers-color-scheme: dark)')`. OBSERVABLE +
  // differentiating — the device gate asserts `Theme: light` under the default
  // Simulator appearance, and `Theme: dark` under `simctl ui appearance dark`
  // (proven locally), so the read reflects the REAL system appearance rather
  // than a baked constant (a constant would show the same value in both).
  const colorScheme = useColorScheme()
  // Tier-2 i18n proof — `createI18n({ locale, messages, fallbackLocale? })`
  // (from `@pyreon/i18n/core`) lowers to the PyreonI18n reactive container:
  // iOS `@State private var i18n = PyreonI18n(locale: "de", messages: […])`,
  // Android `val i18n = remember { PyreonI18n(initialLocale = "de", …) }`.
  // `i18n.t('hello')` flows through unchanged to the runtime `.t()`, which
  // resolves `messages[locale][key]` (→ the German "Hallo!" here, NOT the
  // English "Hello!" nor the raw key "hello"). OBSERVABLE + differentiating:
  // the device gate asserts the rendered text is the CONFIGURED-locale value
  // "Greeting: Hallo!", proving BOTH table resolution AND locale selection at
  // runtime — a key-passthrough would show "hello", the wrong locale "Hello!".
  const i18n = createI18n({
    locale: 'de',
    fallbackLocale: 'en',
    messages: {
      en: { hello: 'Hello!' },
      de: { hello: 'Hallo!' },
    },
  })
  return (
    <VStack>
      <Text>Count: {count}</Text>
      <Text>Size: {sizeClass}</Text>
      <Text>Theme: {colorScheme}</Text>
      <Text>Greeting: {i18n.t('hello')}</Text>
      {/* M2.2b adaptive-layout proof — a size-class-driven ternary between
          DIFFERENT container types (Inline vs Stack). SwiftUI's ViewBuilder
          rejects `cond ? HStack {…} : VStack {…}` (mismatching types), so the
          PMTC compiler lowers a view-branch ternary to `if cond { … } else
          { … }`. That this counter COMPILES + runs is the device proof the
          if/else lowering produces valid Swift/Compose; the compact branch
          ("Layout: narrow") renders on a phone. */}
      {sizeClass() === 'regular'
        ? <Inline><Text>Layout: wide</Text></Inline>
        : <Stack><Text>Layout: narrow</Text></Stack>}
      {/* A11y device proof — the cross-platform AccessibilityProps vocab
          lowers per-target: iOS `.accessibilityLabel(...)`, Android
          `semantics { contentDescription }`. Differentiating device
          assertion: this element is queryable in the REAL accessibility tree
          by its LABEL ("A11y status ready"), NOT by its visible glyph "●" —
          proving `accessibilityLabel` overrode the accessible name in the
          live tree. (`accessibilityHidden` stays R2/emit-locked: XCUITest's
          string queries don't reliably reflect it — a tooling limitation, not
          an emit gap.) */}
      <Text accessibilityLabel="A11y status ready">●</Text>
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
