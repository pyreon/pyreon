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

  it('exposes no lock() — it does not cross', () => {
    // Chromium-only and fullscreen-gated on the web; an app-level declaration
    // on iOS. A lock() that silently no-ops on two of three targets is worse
    // than a surface that states what it covers.
    expect('lock' in mountHook()).toBe(false)
  })
})
