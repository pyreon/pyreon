import { describe, expect, it } from 'vitest'
import { sonifyValues, valueToHz } from './sonify'
import { createChartLink } from './link'

interface Fake {
  ctx: AudioContext
  hz: number[]
  gains: number[]
  stopped: number
}

const fakeContext = (): Fake => {
  const hz: number[] = []
  const gains: number[] = []
  const state = { stopped: 0 }
  const osc = {
    type: 'sine',
    frequency: { setValueAtTime: (v: number) => hz.push(v) },
    connect: () => undefined,
    disconnect: () => undefined,
    start: () => undefined,
    stop: () => {
      state.stopped++
    },
  }
  const gain = { gain: { setValueAtTime: (v: number) => gains.push(v) }, connect: () => undefined, disconnect: () => undefined }
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: () => Promise.resolve(),
    createOscillator: () => osc,
    createGain: () => gain,
  } as unknown as AudioContext
  return {
    ctx,
    hz,
    gains,
    get stopped() {
      return state.stopped
    },
  }
}

describe('valueToHz', () => {
  it('maps the domain linearly onto the pitch range, clamps outside it, NaN stays NaN', () => {
    expect(valueToHz(0, [0, 10], 220, 880)).toBe(220)
    expect(valueToHz(10, [0, 10], 220, 880)).toBe(880)
    expect(valueToHz(5, [0, 10], 220, 880)).toBe(550)
    expect(valueToHz(-3, [0, 10], 220, 880)).toBe(220)
    expect(valueToHz(4, [4, 4], 220, 880)).toBe(550)
    expect(valueToHz(NaN, [0, 10], 220, 880)).toBeNaN()
  })
})

describe('sonifyValues', () => {
  it('schedules one pitch per datum in value order and steps the callback + the link through the indices', async () => {
    const fake = fakeContext()
    const link = createChartLink()
    const steps: number[] = []
    const seen: number[] = []
    const s = sonifyValues([1, 3, 2], { context: fake.ctx, duration: 150, onStep: (i) => {
      steps.push(i)
      seen.push(link.hover())
    } })
    expect(s.frequencies).toEqual([220, 880, 550])
    expect(s.playing()).toBe(false)
    const withLink = sonifyValues([1, 3, 2], { context: fake.ctx, duration: 150, link, onStep: (i) => {
      steps.push(i)
      seen.push(link.hover())
    } })
    const p = withLink.play()
    expect(withLink.playing()).toBe(true)
    await p
    expect(steps).toEqual([0, 1, 2])
    expect(seen).toEqual([0, 1, 2])
    expect(link.hover()).toBe(-1)
    expect(withLink.playing()).toBe(false)
    expect(fake.hz).toEqual([220, 880, 550])
    expect(fake.stopped).toBeGreaterThanOrEqual(1)
  })
  it('a gap is silence (no pitch, gain 0), stop() ends early and resolves the play promise', async () => {
    const fake = fakeContext()
    const steps: number[] = []
    const s = sonifyValues([1, NaN, 2], { context: fake.ctx, duration: 900, onStep: (i) => steps.push(i) })
    expect(s.frequencies[1]).toBeNaN()
    const p = s.play()
    expect(fake.hz).toEqual([220, 880])
    expect(fake.gains.filter((g) => g === 0).length).toBeGreaterThanOrEqual(2)
    await new Promise((r) => setTimeout(r, 20))
    s.stop()
    await p
    expect(steps).toEqual([0])
    expect(s.playing()).toBe(false)
  })
  it('an empty series resolves at once without touching audio', async () => {
    const fake = fakeContext()
    const s = sonifyValues([], { context: fake.ctx })
    await s.play()
    expect(fake.hz).toEqual([])
    expect(s.playing()).toBe(false)
  })
})
