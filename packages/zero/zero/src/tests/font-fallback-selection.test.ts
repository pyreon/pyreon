/**
 * `computeAutoFallbacks` — which fonts get a CLS fallback, and which are
 * skipped.
 *
 * The point of this pass is Cumulative Layout Shift: a web font swapping
 * in reflows the page unless a metric-matched fallback holds the space.
 * So a font that gets SKIPPED here ships the layout shift the feature
 * exists to remove — and skipping is silent by construction, because the
 * only signal is a `warn` the caller may not have wired.
 *
 * That makes the warn path the interesting one. Two different causes get
 * two different messages, and they need different fixes: "no metrics for
 * this family" means the font was not in the downloaded set or capsize's
 * table, while "unknown system fallback" means the CONFIGURED fallback
 * name is not one this code can measure. Collapsing them into one
 * message sends the reader after the wrong thing.
 *
 * Deduplication matters for a subtler reason: emitting two `@font-face`
 * blocks for one family means the second wins, and which one that is
 * depends on config order rather than on anything the author intended.
 */
import { describe, expect, it } from 'vitest'
import { computeAutoFallbacks, defaultSystemFallback, isCompleteMetrics, slugifyFamily } from '../font-fallback'

const warnsFrom = async (opts: Parameters<typeof computeAutoFallbacks>[0]): Promise<string[]> => {
  const warns: string[] = []
  await computeAutoFallbacks({ ...opts, warn: (m: string) => warns.push(m) })
  return warns
}

describe('a font with known metrics gets a fallback', () => {
  it('produces a fallback for a family capsize knows', async () => {
    // The control. Every "is skipped" spec below is worthless against a
    // pass that produces nothing at all.
    const out = await computeAutoFallbacks({ families: ['Roboto'] })
    expect(out.length, 'Roboto is in the precomputed table').toBeGreaterThan(0)
    expect(out[0]!.family).toBe('Roboto')
  })

  it('emits no warning for the happy path', async () => {
    expect(await warnsFrom({ families: ['Roboto'] })).toEqual([])
  })
})

describe('a font that cannot get a fallback says WHY', () => {
  it('warns by name when there are no metrics for the family', async () => {
    // Silent skipping means the CLS the feature exists to remove ships,
    // and nothing anywhere says which font it was.
    const warns = await warnsFrom({ families: ['Totally Not A Real Font'] })
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('Totally Not A Real Font')
    expect(warns[0], 'and names the consequence').toContain('CLS')
  })

  it('warns DIFFERENTLY when the configured system fallback is unknown', async () => {
    // A different cause with a different fix — this one is a config
    // typo, and the message lists the names that work.
    const warns = await warnsFrom({
      families: ['Roboto'],
      fallbackNames: { Roboto: 'Not A Real System Font' },
    })
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('unknown system fallback')
    expect(warns[0], 'and lists what to use instead').toContain('Arial')
  })

  it('a missing font does not stop the others', async () => {
    // One bad family in a config must not cost every other font its
    // fallback.
    const out = await computeAutoFallbacks({ families: ['Nonexistent Font', 'Roboto'] })
    expect(out.map((f) => f.family)).toEqual(['Roboto'])
  })

  it('works with no warn callback wired at all', async () => {
    // `warn` is optional; the default must be a no-op rather than a
    // crash on the failure path.
    await expect(computeAutoFallbacks({ families: ['Nonexistent Font'] })).resolves.toEqual([])
  })
})

describe('families are skipped and deduplicated deliberately', () => {
  it('honours skipFamilies, case-insensitively', async () => {
    // The opt-out for a font the author is already handling.
    const out = await computeAutoFallbacks({
      families: ['Roboto'],
      skipFamilies: new Set(['roboto']),
    })
    expect(out).toEqual([])
  })

  it('emits ONE fallback for a family listed twice', async () => {
    // Two `@font-face` blocks for one family means the second wins, and
    // which one that is depends on config order.
    const out = await computeAutoFallbacks({ families: ['Roboto', 'Roboto'] })
    expect(out).toHaveLength(1)
  })

  it('treats differing case and whitespace as the same family', async () => {
    const out = await computeAutoFallbacks({ families: ['Roboto', '  roboto  '] })
    expect(out).toHaveLength(1)
  })
})

describe('the system fallback is chosen by CATEGORY', () => {
  it('maps each category to a plausible system face', () => {
    // A serif font matched against a sans-serif fallback still shifts —
    // the metrics differ precisely because the shapes do.
    const serif = defaultSystemFallback('serif')
    const mono = defaultSystemFallback('monospace')
    expect(serif).not.toBe(mono)
    expect(serif.length).toBeGreaterThan(0)
  })

  it('falls back to a default for an unknown or missing category', () => {
    // Capsize's table does not carry a category for everything, and
    // `undefined` must not become the literal fallback name.
    for (const c of [undefined, 'nonsense']) {
      const v = defaultSystemFallback(c)
      expect(v, String(c)).toBeTruthy()
      expect(v).not.toContain('undefined')
    }
  })
})

describe('metric completeness is checked before use', () => {
  it('accepts a complete record and rejects every partial one', () => {
    // A partial record produces NaN in the size-adjust arithmetic, and a
    // NaN in CSS is a dropped declaration — the fallback silently does
    // nothing.
    const complete = { familyName: 'X', ascent: 1, descent: -1, lineGap: 0, unitsPerEm: 1000, xWidthAvg: 500 }
    expect(isCompleteMetrics(complete)).toBe(true)

    for (const key of Object.keys(complete)) {
      const partial = { ...complete } as Record<string, unknown>
      delete partial[key]
      expect(isCompleteMetrics(partial), `missing ${key}`).toBe(false)
    }
  })

  it('rejects non-objects outright', () => {
    for (const v of [null, undefined, 'x', 42, []]) {
      expect(isCompleteMetrics(v), String(v)).toBe(false)
    }
  })
})

describe('slugifyFamily produces a usable CSS identifier', () => {
  it('strips whitespace and punctuation a font name can carry', () => {
    // The slug becomes part of a generated `@font-face` family name; a
    // space or a quote there breaks the declaration silently.
    for (const name of ['Noto Sans JP', "M PLUS 1p", 'IBM Plex Mono']) {
      const slug = slugifyFamily(name)
      expect(slug, name).not.toMatch(/[\s'"]/)
      expect(slug.length, name).toBeGreaterThan(0)
    }
  })
})
