// `usePush()` native emit — the self-owned receipt harness. Own test file
// (not canonical-primitives.test.ts) to avoid append-conflicts with in-flight
// emit PRs, mirroring native-useonline.test.ts.
//
// THE cross-platform contract: one shared source reads the push container's
// reactive fields (`push.lastNotification?.title ?? 'none'`) and the emit
// wires the platform's delivery pipeline with NO app code:
//
//   Swift  → @State container + .onAppear { push.start() } on a ZStack host
//            (start() installs a container-owned UNUserNotificationCenter
//            delegate — the exact pipeline `simctl push` exercises)
//   Kotlin → rememberPyreonPushNotifications() (registers the
//            PYREON_PUSH_ACTION BroadcastReceiver delivery seam)
//
// Before this, `usePush()` emitted a PURE container with a `start(register:)`
// seam nobody wired — the hook rendered its initial state forever on BOTH
// targets, with zero warnings. The same never-wired class as `useOnline()`'s
// NWPathMonitor (found 2026-08-04); the runtime file's own header argued the
// whole capability had to be app-injected because the APNs TOKEN lands in the
// AppDelegate — true of the token, and only the token. Receipt +
// authorization go through UNUserNotificationCenter, whose delegate the
// container can own.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// The natural authored shape: optional-chain the last notification, fall back
// to a placeholder, count the inbox. Probed before pinning — zero warnings on
// both targets.
const SHARED = `
  export function PushPage() {
    const push = usePush()
    return (
      <Stack>
        <Text data-testid="push-title">Push: {push.lastNotification?.title ?? 'none'}</Text>
        <Text data-testid="push-count">Count: {push.notifications.length}</Text>
      </Stack>
    )
  }
`

describe('usePush() native emit (self-owned receipt harness)', () => {
  it('Swift: the emit STARTS receipt on a stable host (never-wired class)', () => {
    const r = transform(SHARED, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var push = PyreonPushNotifications()')
    expect(r.code).toContain('.onAppear { push.start() }')
    expect(r.code).toContain('.onDisappear { push.stop() }')
    // The concrete-host wrap: on a transparent Group a branch flip would
    // redistribute .onDisappear and tear the notification-center delegate
    // away while the view is still on screen (the .task device-found class).
    expect(r.code).toContain('ZStack {')
  })

  it('Swift: reactive field reads lower (optional chain + fallback, count)', () => {
    const r = transform(SHARED, { target: 'swift' })
    expect(r.code).toContain('push.lastNotification?.title ?? "none"')
    expect(r.code).toContain('push.notifications.count')
  })

  it('Kotlin: lowers to the SELF-INSTALLING composable', () => {
    const r = transform(SHARED, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    // A bare `remember { PyreonPushNotifications() }` was the never-wired
    // class — the container rendered its initial state forever.
    expect(r.code).toContain('val push = rememberPyreonPushNotifications()')
    expect(r.code).toContain('push.lastNotification.value?.title ?: "none"')
  })

  // Compile-PROOF (not just a string match): `swiftc -parse` waves through
  // type errors, so assert the emit TYPE-CHECKS against the stub surface
  // (which now carries the no-arg start()). Skips when toolchains are absent.
  it.skipIf(!isSwiftcAvailable())('Swift: push emit type-checks against the stub', () => {
    const out = transform(SHARED, { target: 'swift' }).code
    const res = validateSwiftWithStubs(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: push emit compiles on kotlinc', () => {
    const out = transform(SHARED, { target: 'kotlin' }).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
