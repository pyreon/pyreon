import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAudioRecorder } from '../useAudioRecorder'

const scopes: Array<{ dispose: () => void }> = []
function mountHook() {
  let r!: ReturnType<typeof useAudioRecorder>
  const e = effect(() => {
    r = useAudioRecorder()
  })
  scopes.push(e)
  return r
}

function stub(target: object, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, configurable: true, writable: true })
}

/** Track stops so a test can prove the mic was actually released. */
function fakeStream() {
  const stops: number[] = []
  return {
    stops,
    stream: { getTracks: () => [{ stop: () => stops.push(1) }] } as unknown as MediaStream,
  }
}

describe('useAudioRecorder', () => {
  afterEach(() => {
    for (const s of scopes.splice(0)) s.dispose()
    // biome-ignore lint: test teardown of defineProperty'd globals
    delete (globalThis as unknown as Record<string, unknown>).MediaRecorder
    vi.restoreAllMocks()
  })

  it('reports unsupported when the platform cannot record', () => {
    const r = mountHook()
    // happy-dom has no MediaRecorder — the honest answer is false, and
    // start() must then be a plain false rather than a throw.
    expect(r.supported()).toBe(false)
  })

  it('a DENIED permission resolves false and names the cause', async () => {
    stub(globalThis, 'MediaRecorder', class {})
    stub(globalThis.navigator, 'mediaDevices', {
      getUserMedia: () => Promise.reject(new Error('NotAllowedError')),
    })
    const r = mountHook()
    // The single most likely outcome of this call, and a normal UI branch —
    // so callers get an `if`, not a `try`. Same contract as
    // useWakeLock.request().
    await expect(r.start()).resolves.toBe(false)
    expect(r.recording()).toBe(false)
    expect(r.error()).toContain('permission')
  })

  it('start() on an unsupported platform never throws', async () => {
    const r = mountHook()
    await expect(r.start()).resolves.toBe(false)
    expect(r.error()).toContain('not available')
  })

  it('stop() while idle resolves null rather than an empty URL', async () => {
    const r = mountHook()
    // An object URL that plays nothing is harder to debug than an absence.
    await expect(r.stop()).resolves.toBeNull()
  })

  it('releases the microphone tracks on scope disposal', async () => {
    const { stops, stream } = fakeStream()
    stub(globalThis, 'MediaRecorder', class {
      mimeType = 'audio/webm'
      ondataavailable: unknown = null
      onstop: unknown = null
      start() {}
      stop() {}
    })
    stub(globalThis.navigator, 'mediaDevices', { getUserMedia: () => Promise.resolve(stream) })

    let rec!: ReturnType<typeof useAudioRecorder>
    const e = effect(() => {
      rec = useAudioRecorder()
    })
    await rec.start()
    expect(rec.recording()).toBe(true)
    e.dispose()
    // Stopping the tracks is what turns the OS recording indicator off. A
    // stream outliving its view leaves the mic hot with nothing listening.
    expect(stops.length).toBeGreaterThan(0)
  })
})
