// usePush had no web half — fifth hook with the resolvability gap (PMTC
// matches hook NAMES, never imports, so `import { usePush } from
// '@pyreon/hooks'` compiled natively and resolved nowhere on web).
//
// These tests assert the SHARED-CODE CONTRACT against
// `PyreonPushNotifications` (Swift + Kotlin, verified line-for-line): the
// transition semantics — which transitions clear `error`, what `fail` keeps,
// the idempotent injected-registration seam — are each deliberate native
// design decisions, so drifting from them here would make the targets
// disagree.

import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { usePush, type PyreonPushHandlers, type PyreonPushNotification } from '../usePush'

const note = (body: string): PyreonPushNotification => ({ title: 'T', body, data: {} })

describe('usePush — the web half of PyreonPushNotifications', () => {
  it('starts empty: no token, no notifications, unauthorized, no error', () => {
    const push = usePush()
    expect(push.token).toBeNull()
    expect(push.lastNotification).toBeNull()
    expect(push.notifications).toEqual([])
    expect(push.isAuthorized).toBe(false)
    expect(push.error).toBeNull()
    expect(push.isRegistered).toBe(false)
  })

  it('tokenReceived records the token AND clears error — the only transition that does', () => {
    const push = usePush()
    push.fail('registration failed')
    push.tokenReceived('tok-1')
    expect(push.token).toBe('tok-1')
    expect(push.error).toBeNull()
    // authorize / notificationReceived deliberately do NOT touch error.
    push.fail('later failure')
    push.authorize(true)
    push.notificationReceived(note('hi'))
    expect(push.error).toBe('later failure')
  })

  it('notificationReceived appends in arrival order and tracks the last', () => {
    const push = usePush()
    push.notificationReceived(note('one'))
    push.notificationReceived(note('two'))
    expect(push.notifications.map((n) => n.body)).toEqual(['one', 'two'])
    expect(push.lastNotification?.body).toBe('two')
  })

  it('fail keeps the prior token and notifications — stale-while-error', () => {
    const push = usePush()
    push.tokenReceived('tok-1')
    push.notificationReceived(note('kept'))
    push.fail('boom')
    expect(push.error).toBe('boom')
    expect(push.token).toBe('tok-1')
    expect(push.notifications).toHaveLength(1)
  })

  it('start hands the app handler thunks that drive the pure transitions', () => {
    const push = usePush()
    let handlers: PyreonPushHandlers | undefined
    push.start((h) => {
      handlers = h
      return () => {}
    })
    expect(push.isRegistered).toBe(true)
    handlers!.onToken('tok-9')
    handlers!.onAuthorization(true)
    handlers!.onNotification(note('via edge'))
    handlers!.onError('edge failure')
    expect(push.token).toBe('tok-9')
    expect(push.isAuthorized).toBe(true)
    expect(push.lastNotification?.body).toBe('via edge')
    expect(push.error).toBe('edge failure')
  })

  it('start is idempotent and stop is safe when not started + safe twice', () => {
    // Mirrors the native `_started` guard: a second start must NOT invoke
    // `register` again (double registration = duplicate event delivery), and
    // stop must call the unregister thunk exactly once.
    const push = usePush()
    let registered = 0
    let unregistered = 0
    push.stop() // not started — no-op, no throw
    push.start(() => {
      registered += 1
      return () => {
        unregistered += 1
      }
    })
    push.start(() => {
      registered += 1
      return () => {}
    })
    expect(registered).toBe(1)
    push.stop()
    push.stop()
    expect(unregistered).toBe(1)
    expect(push.isRegistered).toBe(false)
  })

  it('the members are LIVE reactive reads — the load-bearing liveness spec', () => {
    const push = usePush()
    const seen: string[] = []
    const fx = effect(() => {
      seen.push(`${push.token ?? '-'}:${push.isAuthorized}:${push.notifications.length}`)
    })
    push.tokenReceived('tok')
    push.authorize(true)
    push.notificationReceived(note('n'))
    fx.dispose()
    expect(seen).toEqual(['-:false:0', 'tok:false:0', 'tok:true:0', 'tok:true:1'])
  })
})
