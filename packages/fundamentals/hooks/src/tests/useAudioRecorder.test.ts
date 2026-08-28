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

/**
 * A MediaRecorder faithful enough to drive the whole record→stop→URL cycle:
 * it hands chunks to `ondataavailable` and fires `onstop` the way a real one
 * does. Without this the hook's PRIMARY path — stopping and getting audio
 * back — has no coverage at all.
 */
function installRecorder(chunkSizes: number[] = [4]) {
  const { stops, stream } = fakeStream()
  stub(globalThis.navigator, 'mediaDevices', { getUserMedia: async () => stream })
  class FakeRecorder {
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    mimeType = 'audio/webm'
    start() {
      for (const size of chunkSizes) {
        this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) })
      }
    }
    stop() {
      this.onstop?.()
    }
  }
  stub(globalThis, 'MediaRecorder', FakeRecorder)
  return { stops }
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

  it('records, then stop() hands back a URL for the captured audio', async () => {
    // The hook's whole point, and previously uncovered: every existing spec
    // exercised a REFUSAL (unsupported / denied / idle), so the success path
    // that produces audio was never executed.
    installRecorder([4, 6])
    const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip-1')
    const r = mountHook()

    await expect(r.start()).resolves.toBe(true)
    expect(r.recording()).toBe(true)
    expect(r.error()).toBe('')

    await expect(r.stop()).resolves.toBe('blob:clip-1')
    expect(r.recording()).toBe(false)
    // Both chunks must reach the blob — dropping one would silently truncate
    // the recording.
    const blob = url.mock.calls[0]![0] as Blob
    expect(blob.size).toBe(10)
    expect(blob.type).toBe('audio/webm')
  })

  it('releases the microphone after a completed recording, not just on dispose', async () => {
    // A stream that outlives its recording leaves the OS mic indicator on
    // with nothing listening — the privacy-visible form of a leak.
    const { stops } = installRecorder()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip')
    const r = mountHook()
    await r.start()
    await r.stop()
    expect(stops.length).toBeGreaterThan(0)
  })

  it('a recording that captured NOTHING resolves null, not an empty URL', async () => {
    // Zero-size chunks are dropped, so the blob is empty. An object URL that
    // plays nothing is harder to debug than an explicit absence.
    installRecorder([0])
    const url = vi.spyOn(URL, 'createObjectURL')
    const r = mountHook()
    await r.start()
    await expect(r.stop()).resolves.toBeNull()
    expect(url).not.toHaveBeenCalled()
  })

  it('start() twice does not open a second stream', async () => {
    installRecorder()
    const r = mountHook()
    await r.start()
    // Already recording: the second call is a no-op that reports success,
    // rather than replacing the in-flight recorder and losing the audio.
    await expect(r.start()).resolves.toBe(true)
    expect(r.recording()).toBe(true)
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

  it('a SECOND caller that joins an in-flight start gets the same answer', async () => {
    // One `start()`, one contract. The denial handling used to sit in a
    // `catch` around the await, so a caller that joined at the in-flight
    // guard received the raw rejection while the caller that started the
    // attempt got `false` — the same call resolving for one and throwing
    // for the other.
    stub(globalThis, 'MediaRecorder', class {})
    stub(globalThis.navigator, 'mediaDevices', {
      getUserMedia: () => Promise.reject(new Error('NotAllowedError')),
    })
    const r = mountHook()

    const first = r.start()
    const joiner = r.start()

    await expect(joiner).resolves.toBe(false)
    await expect(first).resolves.toBe(false)
  })

  it('concurrent starts open ONE microphone stream, not one each', async () => {
    // Without the shared promise both calls pass the `recording()` check
    // during the permission prompt and each opens a stream — the first is
    // overwritten and left live, so the recording indicator stays on with
    // nothing able to stop it.
    let opened = 0
    stub(globalThis, 'MediaRecorder', class {
      start() {}
      stop() {}
    })
    stub(globalThis.navigator, 'mediaDevices', {
      getUserMedia: async () => {
        opened += 1
        return { getTracks: () => [{ stop: () => {} }] }
      },
    })
    const r = mountHook()

    await Promise.all([r.start(), r.start(), r.start()])

    expect(opened).toBe(1)
  })
})
