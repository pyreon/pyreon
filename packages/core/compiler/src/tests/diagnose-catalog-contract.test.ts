import { describe, expect, it } from 'vitest'
import { ERROR_PATTERNS, diagnoseError } from '../diagnose'

/**
 * A contract over the WHOLE catalog, rather than over the entries someone
 * happened to write an example for.
 *
 * `diagnoseError` returns the FIRST pattern that matches, so the catalog is
 * order-sensitive and its entries are not independent: an entry that throws,
 * that renders an empty `fix`, or whose regex is broad enough to match an
 * unrelated message does not merely fail itself — it decides what every entry
 * after it can ever answer. `check-diagnose-catalog` counts entries and
 * `diagnose.test.ts` drives ~20 real symptom strings through the front door;
 * neither can see an entry that was never reached.
 *
 * HONEST LIMIT, stated so the next reader does not over-trust this file: the
 * per-entry checks below prove each `diagnose` RENDERS, not that its `pattern`
 * matches a message a user will really see. Reachability from a real symptom
 * is what `diagnose.test.ts` covers, one entry at a time.
 */
describe('ERROR_PATTERNS — catalog-wide contract', () => {
  // Satisfies both shapes in the catalog: the 57 entries that ignore their
  // argument, and the ~19 that interpolate m[0]..m[3] into the prose.
  const syntheticMatch = [
    '<the matched text>',
    'FirstCapture',
    'SecondCapture',
    'ThirdCapture',
  ] as unknown as RegExpMatchArray

  // A regex with an OPTIONAL group matches without producing that capture, so
  // `m[1]` is legitimately `undefined` at runtime. An entry that assumes its
  // captures are always present renders "undefined" into the prose, or throws
  // outright if it calls a string method on one — and it does so precisely on
  // the shorter, more degenerate error message, which is the one a user is
  // most likely to hit.
  const absentCaptures = [
    '<the matched text>',
    undefined,
    undefined,
    undefined,
  ] as unknown as RegExpMatchArray

  // Several entries mine the MATCHED TEXT for a quoted token — a key, a prop,
  // an attribute name — to name the offending thing in the prose
  // (`m[0]?.match(/"([^"]*)"/)`). With an unquoted sentinel those arms never
  // run, so the branch that actually reaches a user goes unexercised.
  const quotedMatch = [
    'Duplicate key "row-7" in <For> list',
    'FirstCapture',
    'SecondCapture',
    'ThirdCapture',
  ] as unknown as RegExpMatchArray

  // A real `String.prototype.match` result carries `.input` — the FULL message,
  // not just the matched slice — and at least one entry prefers it precisely
  // because its pattern stops short of the symbol it wants to name. A synthetic
  // array without `.input` silently exercises only the fallback.
  const withInput = Object.assign(
    ['emitted a call to _ssrAttr', 'FirstCapture'] as unknown as RegExpMatchArray,
    {
      input:
        'SyntaxError: The requested module does not provide an export named "_ssrAttr"',
      index: 0,
    },
  )

  it.each([
    ['captures present', syntheticMatch],
    ['captures absent (optional groups did not match)', absentCaptures],
    ['matched text carrying a quoted token', quotedMatch],
    ['a faithful match array carrying .input', withInput],
  ])('every entry renders a complete diagnosis — %s', (_label, match) => {
    const broken: string[] = []
    ERROR_PATTERNS.forEach((entry, i) => {
      const id = `#${i} ${entry.pattern.source.slice(0, 60)}`
      let d
      try {
        d = entry.diagnose(match)
      } catch (err) {
        broken.push(`${id} — threw: ${String(err)}`)
        return
      }
      if (typeof d.cause !== 'string' || d.cause.trim().length === 0)
        broken.push(`${id} — empty cause`)
      if (typeof d.fix !== 'string' || d.fix.trim().length === 0)
        broken.push(`${id} — empty fix`)
    })
    expect(broken, `catalog entries that do not render:\n${broken.join('\n')}`).toEqual([])
  })

  it('no entry reads a capture group its own pattern cannot produce', () => {
    // A `diagnose` that reads m[3] when its pattern captures two groups renders
    // the literal "undefined" into text a user reads. Searching the prose for
    // that word does NOT work — a dozen entries legitimately discuss
    // `undefined` ("Cannot read properties of undefined", `aria-x="undefined"`,
    // "useLoaderData() returns undefined"), so the word is not the signal.
    //
    // The signal is a DIFFERENCE: render each entry twice, once with a match
    // array sized to exactly what its own regex can capture and once with a
    // generously long one. An entry that stays within its groups renders
    // identically; one that reaches past them renders `undefined` in the short
    // pass and a value in the long one.
    const overreaching: string[] = []
    const render = (entry: (typeof ERROR_PATTERNS)[number], len: number) => {
      const m = Array.from({ length: len }, (_, i) =>
        i === 0 ? '<matched>' : `capture${i}`,
      ) as unknown as RegExpMatchArray
      const d = entry.diagnose(m)
      return `${d.cause}\u0000${d.fix}\u0000${d.fixCode ?? ''}\u0000${d.related ?? ''}`
    }
    ERROR_PATTERNS.forEach((entry, i) => {
      // `source + '|'` makes the regex match the empty string, so exec always
      // returns an array whose length is 1 + the pattern's own group count.
      const groups = new RegExp(`${entry.pattern.source}|`).exec('')!.length
      if (render(entry, groups) !== render(entry, groups + 8))
        overreaching.push(`#${i} ${entry.pattern.source.slice(0, 60)} (captures ${groups - 1})`)
    })
    expect(
      overreaching,
      `entries reading past their own capture groups:\n${overreaching.join('\n')}`,
    ).toEqual([])
  })

  it('no entry matches an empty message', () => {
    // A pattern that matches '' sits in front of every entry below it and
    // answers every unrecognised error with its own diagnosis.
    const greedy = ERROR_PATTERNS.filter((e) => e.pattern.test('')).map(
      (e) => e.pattern.source.slice(0, 60),
    )
    expect(greedy, `patterns matching the empty string:\n${greedy.join('\n')}`).toEqual([])
  })

  it('no entry claims an error that belongs to another tool', () => {
    // The catalog must stay silent on messages it has nothing to say about —
    // a false diagnosis costs more than none, because it sends the reader
    // somewhere confidently wrong.
    for (const foreign of [
      'ENOTFOUND some.host — network unreachable',
      'EACCES: permission denied, open "/etc/hosts"',
      'npm ERR! code ERESOLVE',
      'fatal: not a git repository',
      'Error: connect ECONNREFUSED 127.0.0.1:5432',
    ]) {
      expect(diagnoseError(foreign), foreign).toBeNull()
    }
  })

  it('the catalog is non-trivial and every pattern is distinct', () => {
    expect(ERROR_PATTERNS.length).toBeGreaterThan(50)
    const sources = ERROR_PATTERNS.map((e) => e.pattern.source)
    expect(new Set(sources).size, 'duplicate patterns — the second is unreachable').toBe(
      sources.length,
    )
  })
})
