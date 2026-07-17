/**
 * `_ssr` / `_ssrItem` positional-hole fast path — byte-identity differential.
 *
 * WHY THIS EXISTS. Both take POSITIONAL hole params (`a..f` + a trailing
 * `...rest`) instead of a rest array — worth ~7% of a whole 1000-row SSR
 * render (see `_ssrFixed` for the measurement + its traps). Call sites are
 * unchanged, so the fast path must be byte-identical to the generic
 * `_ssrConcat` walk for EVERY arity and EVERY hole shape, or it silently
 * corrupts every SSR row on every page.
 *
 * The oracle below is a FROZEN verbatim copy of the generic walk, deliberately
 * NOT an import — importing `_ssrConcat` would let a future edit move both
 * sides together and pass vacuously (the same discipline as
 * `router/tests/scan-clean-path.test.ts`).
 *
 * The load-bearing cases are the ones a hand-unrolled `statics[n]` chain gets
 * wrong: a swapped index (caught by uniquely-identifiable statics), a `typeof`
 * guard reading the wrong variable (caught by placing a non-string hole at
 * EVERY position of EVERY arity), and the positional/rest boundary at arity 7.
 *
 * BISECT-VERIFIED (2026-07-17): swapping a single index in the arity-6 arm
 * (`statics[4]` → `statics[3]`) fails with `<S3>` where `<S4>` belongs;
 * dropping one `typeof` guard fails the RawHtml-at-position case; restored →
 * all pass.
 */
import { _ssr, _ssrItem } from '../index'

/**
 * `RawHtml` is intentionally NOT exported (it is the SSR trust boundary), so
 * reach the real class through the public entry rather than widening the
 * package's export set for a test: `_ssr` returns one.
 */
const RawHtmlCtor = (_ssr(['probe']) as object).constructor as new (v: string) => {
  value: string
}
const isRaw = (v: unknown): v is { value: string } => v instanceof RawHtmlCtor

/**
 * FROZEN ORACLE — a verbatim copy of the generic `_ssrConcat` string walk as
 * it stood BEFORE the positional change. Deliberately duplicated rather than
 * imported: importing the live helper would let a future edit move both sides
 * together and pass vacuously.
 *
 * Note it keys on `holes.length` (holes actually passed) and reads every
 * static as `statics[i + 1] ?? ''` — both are load-bearing contract details
 * the fast path must reproduce exactly, NOT incidental defensiveness.
 */
function oracle(statics: readonly string[], holes: readonly unknown[]): string {
  let acc = statics[0] ?? ''
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]
    acc += (isRaw(h) ? h.value : String(h)) + (statics[i + 1] ?? '')
  }
  return acc
}

/** Both entries share `_ssrFixed`; `_ssr` only differs by the RawHtml wrap. */
const unwrap = (r: unknown): string => (isRaw(r) ? r.value : (r as string))
const callItem = (s: readonly string[], h: readonly unknown[]) => _ssrItem(s, ...h)
const callSsr = (s: readonly string[], h: readonly unknown[]) => unwrap(_ssr(s, ...h))

const ENTRIES: [string, (s: readonly string[], h: readonly unknown[]) => unknown][] = [
  ['_ssrItem', callItem],
  ['_ssr', callSsr],
]

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}
const ALPHABET = ['', 'a', '<li>', '">', 'x'.repeat(40), '</span><span class="', '0', ' ', '&amp;']

// Arities 0..8 span every fused arm (0..6 holes) PLUS the first two that fall
// through to the trailing `...rest` — the boundary the positional form creates.
const ARITIES = [0, 1, 2, 3, 4, 5, 6, 7, 8]

describe.each(ENTRIES)('%s — positional holes are byte-identical to the generic walk', (_n, call) => {
  it('matches the oracle across arities 0..8 with all-string holes (seeded fuzz)', () => {
    const rnd = lcg(0xc0ffee)
    for (const arity of ARITIES) {
      for (let trial = 0; trial < 150; trial++) {
        const statics = Array.from(
          { length: arity + 1 },
          () => ALPHABET[(rnd() * ALPHABET.length) | 0]!,
        )
        const holes = Array.from({ length: arity }, () => ALPHABET[(rnd() * ALPHABET.length) | 0]!)
        expect(
          call(statics, holes),
          `arity=${arity} trial=${trial} statics=${JSON.stringify(statics)}`,
        ).toBe(oracle(statics, holes))
      }
    }
  })

  it('position is exact — every hole lands between its own two statics', () => {
    // A wrong statics[] index is invisible when statics are interchangeable;
    // make every slot uniquely identifiable so an off-by-one cannot hide.
    for (const arity of ARITIES) {
      const statics = Array.from({ length: arity + 1 }, (_, i) => `<S${i}>`)
      const holes = Array.from({ length: arity }, (_, i) => `<H${i}>`)
      const expected = statics.reduce((acc, s, i) => acc + (i > 0 ? holes[i - 1]! : '') + s, '')
      expect(call(statics, holes), `arity=${arity}`).toBe(expected)
      // Guard the guard: the oracle must agree with the hand-computed value,
      // so a mistake shared by both sides still fails.
      expect(oracle(statics, holes), `oracle arity=${arity}`).toBe(expected)
    }
  })

  it('short statics (fewer than holes + 1) match the oracle at every arity', () => {
    for (const arity of ARITIES) {
      if (arity === 0) continue
      for (let shorten = 1; shorten <= Math.min(arity, 3); shorten++) {
        const statics = Array.from({ length: arity + 1 - shorten }, (_, i) => `<S${i}>`)
        const holes = Array.from({ length: arity }, (_, i) => `<H${i}>`)
        expect(call(statics, holes), `arity=${arity} shorten=${shorten}`).toBe(
          oracle(statics, holes),
        )
      }
    }
  })

  it('a RawHtml hole at ANY position of ANY arity falls back correctly', () => {
    // Catches a `typeof` guard reading the wrong variable — the classic
    // copy-paste defect in a hand-unrolled multi-arm switch.
    for (const arity of ARITIES) {
      if (arity === 0) continue
      for (let pos = 0; pos < arity; pos++) {
        const statics = Array.from({ length: arity + 1 }, (_, i) => `<S${i}>`)
        const holes: unknown[] = Array.from({ length: arity }, (_, i) => `<H${i}>`)
        holes[pos] = new RawHtmlCtor(`<RAW${pos}>`)
        const expected = statics.reduce(
          (acc, s, i) => acc + (i > 0 ? (i - 1 === pos ? `<RAW${pos}>` : `<H${i - 1}>`) : '') + s,
          '',
        )
        expect(call(statics, holes), `arity=${arity} rawAt=${pos}`).toBe(expected)
      }
    }
  })

  it('an async hole at ANY position still promotes and resumes', async () => {
    for (const arity of ARITIES) {
      if (arity === 0) continue
      for (let pos = 0; pos < arity; pos++) {
        const statics = Array.from({ length: arity + 1 }, (_, i) => `<S${i}>`)
        const holes: unknown[] = Array.from({ length: arity }, (_, i) => `<H${i}>`)
        holes[pos] = Promise.resolve(`<H${pos}>`)
        const expected = statics.reduce((acc, s, i) => acc + (i > 0 ? `<H${i - 1}>` : '') + s, '')
        const r = call(statics, holes)
        const settled = r instanceof Promise ? unwrap(await r) : unwrap(r)
        expect(settled, `arity=${arity} asyncAt=${pos}`).toBe(expected)
      }
    }
  })

  it('keys on holes PASSED, not statics.length — arity mismatch parity', () => {
    // THE bug the positional form invites, and the reason `_ssrFixed` takes an
    // explicit `n` from `arguments.length` instead of reading `statics.length`.
    // The compiler always emits `statics.length === holes.length + 1`, so these
    // shapes are unreachable from compiled output — but a `statics.length`-keyed
    // fast path SILENTLY DROPS a hole here, and silent row corruption is not a
    // thing to leave resting on "the emit can't produce it".
    //
    // Verified against the PRE-CHANGE runtime (0.47.0): these exact calls
    // returned "<a>", "aXb" and "aXbY" respectively.
    expect(call(['<a>', '</a>'], []), 'fewer holes than statics imply').toBe('<a>')
    expect(call(['a', 'b', 'c'], ['X']), 'one hole, statics imply two').toBe('aXb')
    expect(call(['a', 'b'], ['X', 'Y']), 'MORE holes than statics imply').toBe('aXbY')
    // …and the frozen oracle agrees, so the expectation is not self-confirming.
    expect(oracle(['<a>', '</a>'], [])).toBe('<a>')
    expect(oracle(['a', 'b', 'c'], ['X'])).toBe('aXb')
    expect(oracle(['a', 'b'], ['X', 'Y'])).toBe('aXbY')
  })

  it('surplus holes past the fused arms (7+) still append with empty statics', () => {
    // Exercises the trailing `...rest` path together with short statics.
    const holes = Array.from({ length: 9 }, (_, i) => `<H${i}>`)
    expect(call(['s0', 's1'], holes)).toBe(oracle(['s0', 's1'], holes))
  })
})

describe('_ssr — trust-boundary brand survives the fast path', () => {
  it('returns a RawHtml on the fused path, not a bare string', () => {
    // `_ssr`'s contract is the RawHtml brand (a component's return crosses a
    // trust boundary); the fast path must wrap, not shortcut past it.
    const r = _ssr(['<b>', '</b>'], 'hi')
    expect(isRaw(r)).toBe(true)
    expect(unwrap(r)).toBe('<b>hi</b>')
  })

  it('still returns a RawHtml when a hole forces the generic walk', () => {
    const r = _ssr(['<b>', '</b>'], new RawHtmlCtor('<i>x</i>'))
    expect(isRaw(r)).toBe(true)
    expect(unwrap(r)).toBe('<b><i>x</i></b>')
  })

  it('still resolves to a RawHtml when a hole is async', async () => {
    const r = await (_ssr(['<b>', '</b>'], Promise.resolve('hi')) as Promise<unknown>)
    expect(isRaw(r)).toBe(true)
    expect(unwrap(r)).toBe('<b>hi</b>')
  })
})
