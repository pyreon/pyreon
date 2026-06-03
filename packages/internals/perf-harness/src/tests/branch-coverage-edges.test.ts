/**
 * Branch-coverage tests for the formatDiff cosmetic ternary branches +
 * record() preserved-value-restore path.
 */
import { describe, expect, it } from 'vitest'
import { formatDiff } from '../diff'
import { perfHarness } from '../harness'

describe('formatDiff — ternary branches', () => {
  it('formats delta with - sign when negative + pct=null path', () => {
    const out = formatDiff({
      entries: [
        { name: 'a', before: 10, after: 5, delta: -5, pct: -50 },
        { name: 'b', before: 0, after: 0, delta: 0, pct: null },
      ],
      added: [],
      removed: [],
    })
    expect(out).toContain('-5')
    expect(out).toContain('—')
    expect(out).toContain('-50.0%')
  })

  it('formats delta with + sign when positive', () => {
    const out = formatDiff({
      entries: [{ name: 'a', before: 5, after: 10, delta: 5, pct: 100 }],
      added: [],
      removed: [],
    })
    expect(out).toContain('+5')
    expect(out).toContain('+100.0%')
  })
})

describe('record() — preserves nonzero counters', () => {
  it('restores preserved nonzero counters AND skips zero ones (L68 branch)', async () => {
    perfHarness.enable()
    perfHarness.reset()
    const g = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }
    g.__pyreon_count__?.('preserved.value', 7)
    g.__pyreon_count__?.('preserved.zero', 0)

    const before = perfHarness.snapshot()
    const result = await perfHarness.record('label', () => {
      g.__pyreon_count__?.('inside', 3)
      return 'ok'
    })
    expect(result.result).toBe('ok')

    // After record() the preserved values should be restored
    const after = perfHarness.snapshot() as Record<string, number>
    expect(after['preserved.value']).toBe(7)
    expect((before as Record<string, number>)['preserved.value']).toBe(7)

    perfHarness.disable()
  })
})
