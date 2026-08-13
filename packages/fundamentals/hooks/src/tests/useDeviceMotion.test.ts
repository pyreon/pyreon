import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDeviceMotion } from '../useDeviceMotion'

const scopes: Array<{ dispose: () => void }> = []
function mountHook() {
  let r!: ReturnType<typeof useDeviceMotion>
  const e = effect(() => { r = useDeviceMotion() })
  scopes.push(e)
  return r
}

function installDME(requestPermission?: () => Promise<'granted' | 'denied'>) {
  const ctor = class {} as unknown as Record<string, unknown>
  if (requestPermission) ctor.requestPermission = requestPermission
  Object.defineProperty(globalThis, 'DeviceMotionEvent', { value: ctor, configurable: true })
}

describe('useDeviceMotion', () => {
  afterEach(() => {
    for (const s of scopes.splice(0)) s.dispose()
    // biome-ignore lint: test teardown of a defineProperty'd global
    delete (globalThis as unknown as Record<string, unknown>).DeviceMotionEvent
    vi.restoreAllMocks()
  })

  it('reports unsupported when DeviceMotionEvent is absent', () => {
    // happy-dom DEFINES DeviceMotionEvent, so this has to remove it rather
    // than assume a bare environment — the default here is `supported`, and a
    // test that assumed otherwise would be asserting the harness, not the hook.
    const saved = (globalThis as unknown as Record<string, unknown>).DeviceMotionEvent
    // biome-ignore lint: deliberately removing a global to test the SSR-ish path
    delete (globalThis as unknown as Record<string, unknown>).DeviceMotionEvent
    expect(mountHook().supported()).toBe(false)
    Object.defineProperty(globalThis, 'DeviceMotionEvent', {
      value: saved,
      configurable: true,
    })
  })

  it('starts without a prompt where requestPermission does not exist', async () => {
    installDME()
    const m = mountHook()
    // Absence of the method is a GRANT, not a failure — it is iOS-Safari-only.
    await expect(m.start()).resolves.toBe(true)
    expect(m.active()).toBe(true)
  })

  it('a DENIED iOS prompt resolves false and never activates', async () => {
    installDME(async () => 'denied')
    const m = mountHook()
    await expect(m.start()).resolves.toBe(false)
    expect(m.active()).toBe(false)
  })

  it('a THROWN prompt (no user gesture) is ordinary, not fatal', async () => {
    installDME(async () => {
      throw new Error('requires a user gesture')
    })
    await expect(mountHook().start()).resolves.toBe(false)
  })

  it('stops listening on scope disposal', async () => {
    installDME()
    const remove = vi.spyOn(window, 'removeEventListener')
    let m!: ReturnType<typeof useDeviceMotion>
    const e = effect(() => { m = useDeviceMotion() })
    await m.start()
    e.dispose()
    // A sensor left running past its view drains battery for a screen nobody
    // is looking at.
    expect(remove).toHaveBeenCalledWith('devicemotion', expect.any(Function))
  })
})
