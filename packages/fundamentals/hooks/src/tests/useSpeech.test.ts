import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSpeech } from '../useSpeech'

const scopes: Array<{ dispose: () => void }> = []
function mountHook() {
  let r!: ReturnType<typeof useSpeech>
  const e = effect(() => { r = useSpeech() })
  scopes.push(e)
  return r
}

function installSynth() {
  const calls: string[] = []
  Object.defineProperty(globalThis, 'speechSynthesis', {
    value: { speak: (u: { text: string }) => calls.push(`speak:${u.text}`), cancel: () => calls.push('cancel') },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: class { text: string; onend: unknown = null; onerror: unknown = null
      constructor(t: string) { this.text = t } },
    configurable: true,
  })
  return calls
}

describe('useSpeech', () => {
  afterEach(() => {
    for (const s of scopes.splice(0)) s.dispose()
    // biome-ignore lint: test teardown of defineProperty'd globals
    delete (globalThis as unknown as Record<string, unknown>).speechSynthesis
    vi.restoreAllMocks()
  })

  it('reports unsupported without a synthesiser', () => {
    expect(mountHook().supported()).toBe(false)
  })

  it('speak() on an unsupported platform is a plain false', async () => {
    await expect(mountHook().speak('hi')).resolves.toBe(false)
  })

  it('CANCELS before speaking, so a second press replaces rather than queues', async () => {
    const calls = installSynth()
    const s = mountHook()
    await s.speak('one')
    await s.speak('two')
    // Queueing is the platform default; without the cancel the second press
    // would talk over the first instead of replacing it.
    expect(calls).toEqual(['cancel', 'speak:one', 'cancel', 'speak:two'])
    expect(s.speaking()).toBe(true)
  })

  it('empty text is a no-op, not an empty utterance', async () => {
    const calls = installSynth()
    await expect(mountHook().speak('')).resolves.toBe(false)
    expect(calls).toEqual([])
  })

  it('stops speaking on scope disposal', async () => {
    const calls = installSynth()
    let sp!: ReturnType<typeof useSpeech>
    const e = effect(() => { sp = useSpeech() })
    await sp.speak('long article')
    e.dispose()
    // Speech outlives the DOM on every browser — without this it talks over
    // the next screen.
    expect(calls.filter((c) => c === 'cancel').length).toBeGreaterThan(1)
  })
})
