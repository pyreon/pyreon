import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScreenOrientation } from '../useScreenOrientation'

const scopes: Array<{ dispose: () => void }> = []
function mountHook() {
  let r!: ReturnType<typeof useScreenOrientation>
  const e = effect(() => {
    r = useScreenOrientation()
  })
  scopes.push(e)
  return r
}

function stubOrientation(type: string, angle: number) {
  Object.defineProperty(globalThis.screen, 'orientation', {
    value: { type, angle },
    configurable: true,
  })
}

describe('useScreenOrientation', () => {
  afterEach(() => {
    for (const s of scopes.splice(0)) s.dispose()
    vi.restoreAllMocks()
  })

  it('normalises the web type to portrait | landscape', () => {
    stubOrientation('landscape-secondary', 270)
    const o = mountHook()
    // The primary/secondary distinction is not lost — it lives in `angle`,
    // which is what the native targets can also express.
    expect(o.type()).toBe('landscape')
    expect(o.angle()).toBe(270)
  })

  it('reports portrait for a portrait-secondary display', () => {
    stubOrientation('portrait-secondary', 180)
    const o = mountHook()
    expect(o.type()).toBe('portrait')
    expect(o.angle()).toBe(180)
  })

  it('falls back to geometry when the Screen Orientation API is absent', () => {
    // biome-ignore lint: removing a defineProperty'd global for this test
    delete (globalThis.screen as unknown as Record<string, unknown>).orientation
    Object.defineProperty(globalThis, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(globalThis, 'innerHeight', { value: 400, configurable: true })
    expect(mountHook().type()).toBe('landscape')
  })

  it('REPORTS a rotation — the reading updates when the device turns', () => {
    // The hook is reactive; nothing tested that it actually reacts. Without
    // this, `update` could have been wired to the wrong event, read the wrong
    // field, or never been attached, and every other spec would still pass —
    // they all read the value once at mount.
    stubOrientation('portrait-primary', 0)
    const o = mountHook()
    expect(o.type()).toBe('portrait')

    stubOrientation('landscape-primary', 90)
    window.dispatchEvent(new Event('orientationchange'))
    expect(o.type()).toBe('landscape')
    expect(o.angle()).toBe(90)
  })

  it('a resize that did NOT change orientation does not re-notify', () => {
    // Resize fires continuously during a window drag. Writing on every one
    // would wake every consumer of this hook for a change that never happened.
    stubOrientation('portrait-primary', 0)
    const o = mountHook()
    let fires = 0
    const e = effect(() => {
      o.type()
      fires += 1
    })
    scopes.push(e)
    const before = fires

    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    expect(fires).toBe(before)

    // ...but a real change still gets through.
    stubOrientation('landscape-primary', 90)
    window.dispatchEvent(new Event('resize'))
    expect(fires).toBeGreaterThan(before)
  })

  it('an ANGLE-only change is a real change (portrait ⇄ portrait-secondary)', () => {
    // Both normalise to 'portrait', so a type-only comparison would miss a
    // 180° flip — which matters to anything reading `angle`.
    stubOrientation('portrait-primary', 0)
    const o = mountHook()
    stubOrientation('portrait-secondary', 180)
    window.dispatchEvent(new Event('orientationchange'))
    expect(o.type()).toBe('portrait')
    expect(o.angle()).toBe(180)
  })

  it('stops listening once the owning scope is disposed', () => {
    stubOrientation('portrait-primary', 0)
    let o!: ReturnType<typeof useScreenOrientation>
    const e = effect(() => { o = useScreenOrientation() })
    e.dispose()

    stubOrientation('landscape-primary', 90)
    window.dispatchEvent(new Event('orientationchange'))
    // A listener outliving its scope keeps the hook's signal — and whatever
    // the consumer closed over — alive for the life of the page.
    expect(o.type()).toBe('portrait')
  })

  it('exposes no lock() — it does not cross', () => {
    // Chromium-only and fullscreen-gated on the web; an app-level declaration
    // on iOS. A lock() that silently no-ops on two of three targets is worse
    // than a surface that states what it covers.
    expect('lock' in mountHook()).toBe(false)
  })
})
