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

  it('REPORTS motion — the readings reach the signals', async () => {
    // Previously nothing invoked the listener, so the hook could have been
    // wired to the wrong event fields (or nothing at all) and every spec
    // would still have passed: they only covered permission outcomes.
    installDME()
    const m = mountHook()
    await m.start()

    const e = new Event('devicemotion') as DeviceMotionEvent
    Object.defineProperty(e, 'accelerationIncludingGravity', {
      value: { x: 1, y: 2, z: 3 },
    })
    // Rotation deliberately maps beta→x, gamma→y, alpha→z: the spec's names
    // are axis-rotations, and this mapping is what makes the two vectors read
    // in the same frame. A transposition here would be invisible without it.
    Object.defineProperty(e, 'rotationRate', { value: { alpha: 10, beta: 20, gamma: 30 } })
    window.dispatchEvent(e)

    expect(m.acceleration()).toEqual({ x: 1, y: 2, z: 3 })
    expect(m.rotation()).toEqual({ x: 20, y: 30, z: 10 })
  })

  it('a partial reading fills the missing axes with 0, never null', async () => {
    // Real devices omit axes they cannot measure. Passing null through would
    // break any arithmetic a consumer does on the vector.
    installDME()
    const m = mountHook()
    await m.start()

    const e = new Event('devicemotion') as DeviceMotionEvent
    Object.defineProperty(e, 'accelerationIncludingGravity', {
      value: { x: null, y: 5, z: null },
    })
    window.dispatchEvent(e)
    expect(m.acceleration()).toEqual({ x: 0, y: 5, z: 0 })
  })

  it('a partial ROTATION fills the missing axes with 0 too', async () => {
    // The symmetric half of the acceleration case. Both vectors are built by
    // separate expressions, so covering one proves nothing about the other.
    installDME()
    const m = mountHook()
    await m.start()

    const e = new Event('devicemotion') as DeviceMotionEvent
    Object.defineProperty(e, 'rotationRate', { value: { alpha: null, beta: 4, gamma: null } })
    window.dispatchEvent(e)
    expect(m.rotation()).toEqual({ x: 4, y: 0, z: 0 })
  })

  it('an event carrying NO motion data leaves the last reading intact', async () => {
    // Some engines fire the event with null payloads between real samples.
    // Zeroing on those would make a reading flicker to origin and back.
    installDME()
    const m = mountHook()
    await m.start()

    const good = new Event('devicemotion') as DeviceMotionEvent
    Object.defineProperty(good, 'accelerationIncludingGravity', { value: { x: 9, y: 9, z: 9 } })
    window.dispatchEvent(good)

    window.dispatchEvent(new Event('devicemotion'))
    expect(m.acceleration()).toEqual({ x: 9, y: 9, z: 9 })
  })

  it('stop() detaches the listener — readings stop arriving', async () => {
    installDME()
    const m = mountHook()
    await m.start()
    m.stop()
    expect(m.active()).toBe(false)

    const e = new Event('devicemotion') as DeviceMotionEvent
    Object.defineProperty(e, 'accelerationIncludingGravity', { value: { x: 7, y: 7, z: 7 } })
    window.dispatchEvent(e)
    expect(m.acceleration()).toEqual({ x: 0, y: 0, z: 0 })
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
