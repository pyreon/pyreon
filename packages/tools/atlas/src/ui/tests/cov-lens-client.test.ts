/**
 * The Lens panel's shaping decisions — the half that runs in Node.
 *
 * `lens-client.ts` is browser-FACING but not browser-DEPENDENT: `callRpc` takes
 * its `fetch` as an injected parameter and everything after it is a function
 * over data. So the arms below are exercised with real inputs rather than with
 * a stubbed browser, and each positive shape is paired with the thing it must
 * NOT do.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  callRpc,
  fetchLens,
  type LensLine,
  type LensResult,
  lensSummary,
  relevantLines,
} from '../lens-client'

interface Host {
  __ATLAS_STATIC_RPC__?: Record<string, Record<string, unknown>>
}

afterEach(() => {
  delete (globalThis as Host).__ATLAS_STATIC_RPC__
})

const line = (n: number, text: string, findings: LensLine['findings'] = []): LensLine => ({
  line: n,
  text,
  findings,
})

const finding = (kind: string, suspect = false): LensLine['findings'][number] => ({
  kind,
  detail: kind,
  column: 0,
  suspect,
})

const result = (totals: Record<string, number>, suspects: number): LensResult => ({
  path: 'src/Button.tsx',
  lines: [],
  totals,
  suspects,
})

describe('callRpc — the channel answered, but not with a result', () => {
  it('reports the server error text when the body says ok:false', async () => {
    const fetchImpl = (async () =>
      ({ json: async () => ({ ok: false, error: 'no compiler installed' }) }) as unknown as Response) as unknown as typeof fetch

    await expect(callRpc('lens', { component: 'A' }, fetchImpl)).resolves.toEqual({
      ok: false,
      error: 'no compiler installed',
    })
  })

  it('does not render an undefined error as "undefined" — a failure with no reason still reads as one', async () => {
    const fetchImpl = (async () =>
      ({ json: async () => ({ ok: false }) }) as unknown as Response) as unknown as typeof fetch

    await expect(callRpc('lens', { component: 'A' }, fetchImpl)).resolves.toEqual({
      ok: false,
      error: 'Unknown error',
    })
  })

  it('survives a rejection that is not an Error at all', async () => {
    // `(err as Error)?.message` is undefined for a thrown string; the `??`
    // keeps the reason instead of reporting `undefined`.
    const fetchImpl = (async () => {
      throw 'channel closed'
    }) as unknown as typeof fetch

    await expect(callRpc('lens', {}, fetchImpl)).resolves.toEqual({
      ok: false,
      error: 'channel closed',
    })
  })
})

describe('fetchLens', () => {
  it('turns a refusal into `unavailable` carrying the REAL reason', async () => {
    const fetchImpl = (async () =>
      ({ json: async () => ({ ok: false, error: 'source not found' }) }) as unknown as Response) as unknown as typeof fetch

    await expect(fetchLens('Button', fetchImpl)).resolves.toEqual({
      state: 'unavailable',
      reason: 'source not found',
    })
  })

  it('returns `ready` with the verdict on success', async () => {
    const payload = result({ reactive: 2 }, 0)
    const fetchImpl = (async () =>
      ({ json: async () => ({ ok: true, result: payload }) }) as unknown as Response) as unknown as typeof fetch

    await expect(fetchLens('Button', fetchImpl)).resolves.toEqual({
      state: 'ready',
      result: payload,
    })
  })

  it('reads a baked verdict without a channel at all', async () => {
    const payload = result({ reactive: 1 }, 0)
    ;(globalThis as Host).__ATLAS_STATIC_RPC__ = { lens: { Button: payload } }
    const fetchImpl = (() => {
      throw new Error('should not be reached')
    }) as unknown as typeof fetch

    await expect(fetchLens('Button', fetchImpl)).resolves.toEqual({
      state: 'ready',
      result: payload,
    })
  })
})

describe('relevantLines', () => {
  it('keeps a flagged line WITH its context, so the finding can be read', () => {
    const lines = [line(1, 'a'), line(2, 'b'), line(3, 'c', [finding('static-text')]), line(4, 'd'), line(5, 'e')]
    expect(relevantLines(lines).map((l) => l.line)).toEqual([2, 3, 4])
  })

  it('drops every line when nothing is flagged — no findings means nothing to read', () => {
    expect(relevantLines([line(1, 'a'), line(2, 'b')])).toEqual([])
  })

  it('collapses gaps rather than filling them, so two distant findings stay distinct', () => {
    const lines = [
      line(1, 'a', [finding('footgun')]),
      line(2, 'b'),
      line(3, 'c'),
      line(4, 'd'),
      line(5, 'e', [finding('footgun')]),
    ]
    expect(relevantLines(lines).map((l) => l.line)).toEqual([1, 2, 4, 5])
  })

  it('honours a wider context window', () => {
    const lines = [line(1, 'a'), line(2, 'b'), line(3, 'c', [finding('footgun')]), line(4, 'd')]
    expect(relevantLines(lines, 2).map((l) => l.line)).toEqual([1, 2, 3, 4])
  })
})

describe('lensSummary', () => {
  it('sums all three reactive kinds when there is nothing to act on', () => {
    expect(
      lensSummary(result({ reactive: 2, 'reactive-prop': 3, 'reactive-attr': 1 }, 0)),
    ).toBe('No baked-once reads or footguns — 6 reactive expression(s).')
  })

  it('reports zero reactive expressions rather than NaN when no totals are present', () => {
    expect(lensSummary(result({}, 0))).toBe(
      'No baked-once reads or footguns — 0 reactive expression(s).',
    )
  })

  it('leads with the baked-once count — the number to act on', () => {
    expect(lensSummary(result({ 'static-text': 3 }, 3))).toBe(
      '3 baked once — check these before assuming the UI updates.',
    )
  })

  it('singularises one footgun, because "1 footguns" reads as a bug in the tool', () => {
    expect(lensSummary(result({ footgun: 1 }, 1))).toBe(
      '1 footgun — check these before assuming the UI updates.',
    )
  })

  it('joins both kinds when both are present, plural side', () => {
    expect(lensSummary(result({ 'static-text': 1, footgun: 2 }, 3))).toBe(
      '1 baked once · 2 footguns — check these before assuming the UI updates.',
    )
  })
})
