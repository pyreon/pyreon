// Gap 7 infrastructure tests — computeStreak for the
// native-device green-streak tracker.

import { describe, expect, it } from 'vitest'
import {
  computeStreak,
  type WorkflowRun,
} from '../../../../../scripts/check-native-device-streak'

function run(
  conclusion: string | null,
  daysAgo: number,
  status: string = 'completed',
): WorkflowRun {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return {
    id: Math.floor(Math.random() * 1e9),
    name: 'native-device',
    head_branch: 'main',
    status,
    conclusion,
    created_at: date.toISOString(),
  }
}

describe('check-native-device-streak — computeStreak', () => {
  it('returns 0 for no runs', () => {
    const r = computeStreak([])
    expect(r.streak).toBe(0)
    expect(r.lastFailure).toBeNull()
  })

  it('counts consecutive successes from newest run', () => {
    const r = computeStreak([
      run('success', 0),
      run('success', 1),
      run('success', 2),
      run('success', 3),
    ])
    expect(r.streak).toBe(4)
    expect(r.lastFailure).toBeNull()
  })

  it('stops counting at first failure', () => {
    const r = computeStreak([
      run('success', 0),
      run('success', 1),
      run('failure', 2),
      run('success', 3),
      run('success', 4),
    ])
    expect(r.streak).toBe(2)
    expect(r.lastFailure).not.toBeNull()
  })

  it('cancelled runs count as failures', () => {
    const r = computeStreak([
      run('success', 0),
      run('cancelled', 1),
      run('success', 2),
    ])
    expect(r.streak).toBe(1)
  })

  it('skipped runs count as failures (non-success)', () => {
    const r = computeStreak([
      run('skipped', 0),
      run('success', 1),
    ])
    expect(r.streak).toBe(0)
  })

  it('ignores incomplete runs (status !== completed)', () => {
    const r = computeStreak([
      run('success', 0),
      run(null, 1, 'in_progress'),
      run('success', 2),
    ])
    // In-progress run is filtered out; consecutive successes still count.
    expect(r.streak).toBe(2)
  })

  it('returns recent runs (up to 30)', () => {
    const runs: WorkflowRun[] = []
    for (let i = 0; i < 35; i++) runs.push(run('success', i))
    const r = computeStreak(runs)
    expect(r.recent.length).toBeLessThanOrEqual(30)
    expect(r.streak).toBeGreaterThanOrEqual(30)
  })

  it('sorts by created_at newest first (handles out-of-order input)', () => {
    // Input shuffled; computeStreak must sort.
    const r = computeStreak([
      run('failure', 5),
      run('success', 0),
      run('success', 1),
      run('success', 2),
    ])
    expect(r.streak).toBe(3) // 3 newest are all success
  })
})
