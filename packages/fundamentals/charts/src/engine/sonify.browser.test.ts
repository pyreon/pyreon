import { describe, expect, it } from 'vitest'
import { sonifyValues } from './sonify'

describe('sonifyValues (real browser)', () => {
  it('drives a real AudioContext end to end and settles', async () => {
    const steps: number[] = []
    const s = sonifyValues([2, 4, 3, 5], { duration: 200, onStep: (i) => steps.push(i) })
    await s.play()
    expect(steps).toEqual([0, 1, 2, 3])
    expect(s.playing()).toBe(false)
    // Replaying restarts cleanly (no InvalidStateError from a stale oscillator).
    await s.play()
    expect(steps).toEqual([0, 1, 2, 3, 0, 1, 2, 3])
  })
})
