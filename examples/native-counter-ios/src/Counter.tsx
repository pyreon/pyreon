// The canonical PMTC counter — proves the signal → @State round-trip
// works end-to-end. Per PMTC Phase 0 success criterion 2.
//
// On iOS this compiles to a SwiftUI struct with `@State private var
// count: Int = 0`, displays "Count: \(count)", and increments on
// button tap. SwiftUI's automatic re-render fires when count changes
// via `count.set(...)` (the compiler emits as `count = ...` since
// SwiftUI's @State is a var, not a method).

import { signal } from '@pyreon/reactivity'
import { useHaptics, useShare, useLinking, useNotifications, useBiometrics, useSizeClass, useColorScheme } from '@pyreon/hooks'
import { createI18n } from '@pyreon/i18n/core'
import { createMachine } from '@pyreon/machine'

export function Counter() {
  const count = signal<number>(0)
  // M2.7 animations proof — a `<Transition show>` animates a child's
  // visibility. Native: iOS `.transition(.opacity)` on an `if show { … }`
  // gate driven by `.animation(.default, value:)` on a stable ZStack; Android
  // `AnimatedVisibility(visible = show) { … }`. The web-only CSS-class
  // enter/leave props are ignored on native (each platform animates through
  // its own system). OBSERVABLE + differentiating — the Toggle Box button
  // flips `boxVisible`, and the device gate asserts the animated child
  // ("Animated Box") disappears then reappears, proving the animated
  // show-gate compiles + toggles on-device (the animation vocabulary v1 is
  // conditional-visibility fade; spring/keyframe/gesture-driven absent).
  const boxVisible = signal<boolean>(true)
  // M4.5 / M3.5 async-lowering + biometrics proof — the current biometric-gate
  // outcome, flipped from INSIDE an async handler. Starts "idle"; the Unlock
  // button's `async` handler awaits `bio.authenticate(...)` and sets this to
  // "unlocked"/"denied". On an UNENROLLED simulator/emulator (the CI default)
  // the gate resolves `false` deterministically with NO system prompt, so the
  // observable outcome is "Lock: denied" — a clean, hang-free device assertion.
  const lockStatus = signal<string>('idle')
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
  // M4.5 / M3.5 platform-API proof — a biometric gate whose `authenticate`
  // returns a Promise<boolean>. THE first async-result service: the Unlock
  // handler is `async` and `await`s `bio.authenticate('Unlock')`, so PMTC's
  // async-await lowering wraps that handler in a Swift `Task { … }` / Kotlin
  // `pyreonAsyncScope.launch { … }` (a sync action slot can't await). This is
  // the DEVICE proof that the lowering RUNS (not just compiles): the awaited
  // call completes and the post-await `lockStatus.set(…)` re-renders the text.
  // Native: iOS `PyreonBiometrics().authenticate(_:)` (LAContext), Android
  // `PyreonBiometrics().authenticate(...)` (v1 scaffold; real BiometricPrompt +
  // FragmentActivity is a tracked follow-up). Web: feature-detects
  // `PublicKeyCredential`, resolves false (WebAuthn ceremony needs a server).
  const bio = useBiometrics()
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
  // Tier-2 state-machine proof — `createMachine({ initial, states })` (from
  // `@pyreon/machine`) lowers to the PyreonMachine reactive container (iOS
  // `@State private var power = PyreonMachine(initial: "off", transitions: […])`,
  // Android `val power = remember { PyreonMachine(…) }`). `power()` reads the
  // current state; `power.send('TOGGLE')` applies the transition. Both runtimes
  // back the state reactively (Swift `@Observable`, Compose `mutableStateOf`),
  // so a transition RE-RENDERS. STRONG interactive device proof: the Toggle
  // button drives a real state transition — the device gate asserts the text
  // flips `Power: off` → `Power: on` on tap (a dropped/broken machine would
  // never transition).
  const power = createMachine({
    initial: 'off',
    states: { off: { on: { TOGGLE: 'on' } }, on: { on: { TOGGLE: 'off' } } },
  })
  return (
    <VStack>
      <Text>Count: {count}</Text>
      <Text>Size: {sizeClass}</Text>
      <Text>Theme: {colorScheme}</Text>
      <Text>Greeting: {i18n.t('hello')}</Text>
      <Text>Power: {power()}</Text>
      <Text>Lock: {lockStatus()}</Text>
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
      {/* M4.5 async-lowering device proof — an ASYNC handler that awaits the
          biometric gate. PMTC wraps this `async () => { … await … }` in a Swift
          `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`; a sync action
          slot cannot await. On an unenrolled Simulator/emulator the gate
          resolves false (no prompt), so `lockStatus` flips "idle" → "denied",
          proving the async scope executed AND the post-await re-render fired. */}
      <Button
        onClick={async () => {
          const ok = await bio.authenticate('Unlock')
          lockStatus.set(ok ? 'unlocked' : 'denied')
        }}
      >
        Unlock
      </Button>
      <Button onClick={() => power.send('TOGGLE')}>Toggle Power</Button>
      <Button onClick={() => boxVisible.set(!boxVisible())}>Toggle Box</Button>
      <Transition show={() => boxVisible()}>
        <Text>Animated Box</Text>
      </Transition>
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
