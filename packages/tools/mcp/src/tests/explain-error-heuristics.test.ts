/**
 * The crash-diagnosis dossier.
 *
 * This is the tool an assistant reaches for when a Pyreon app has thrown
 * and it has a reactive trace to read. Every finding it emits is a
 * hypothesis the assistant will act on, so the two ways it can be wrong
 * are asymmetric: a MISSED finding costs a round trip, while a
 * CONFIDENTLY WRONG one sends the assistant to rewrite working code —
 * and the confidence label is what decides which happens.
 *
 * The input is the least trustworthy in the package: a JSON blob posted
 * by a browser error handler. It can be truncated, it can carry a
 * string error instead of an object, and its trace entries can be
 * missing the fields the heuristics read. None of that may throw — a
 * crash in the crash reporter leaves the caller with nothing at all.
 *
 * `(anonymous)` is the specific shape worth pinning. An unnamed signal
 * is ordinary (a `computed` with no label), and every heuristic reads
 * `e.name`. Without the fallback the dossier reports `"undefined" was
 * written 12 times`, which reads as a signal genuinely called
 * "undefined" and sends the assistant looking for it.
 */
import { describe, expect, it } from 'vitest'
import { analyzeReactiveTrace, buildErrorDossier, errorMessage, parseErrorReport } from '../explain-error'
import type { ErrorReport, TraceEntry } from '../explain-error'

const write = (name: string | undefined, prev: string, next: string): TraceEntry =>
  ({ name, prev, next }) as TraceEntry

const report = (over: Partial<ErrorReport> = {}): ErrorReport =>
  ({ error: { message: 'boom', name: 'TypeError' }, ...over }) as ErrorReport

/** Drive the REAL heuristics with the (trace, message) pair they take. */
const analyze = (r: ErrorReport) => analyzeReactiveTrace(r.reactiveTrace, errorMessage(r))
const codes = (r: ErrorReport) => analyze(r).map((f) => f.code)

describe('a malformed report is refused, never thrown on', () => {
  for (const [label, raw] of [
    ['not JSON', '{ truncated'],
    ['a bare string', '"hello"'],
    ['a number', '42'],
    ['null', 'null'],
    ['an array', '[]'],
    ['an object with no error key', '{"phase":"render"}'],
  ] as Array<[string, string]>) {
    it(`returns null for ${label}`, () => {
      // A throw inside the crash reporter leaves the caller with nothing
      // at all — strictly worse than "I could not read this".
      expect(() => parseErrorReport(raw), label).not.toThrow()
      expect(parseErrorReport(raw), label).toBeNull()
    })
  }

  it('accepts a STRING error as well as an object', () => {
    // Both shapes reach this from real handlers depending on whether the
    // thrown value was an Error.
    expect(parseErrorReport('{"error":"plain message"}')?.error).toBe('plain message')
    expect(errorMessage(parseErrorReport('{"error":"plain message"}')!)).toBe('plain message')
  })

  it('falls back from message to name, then to empty', () => {
    // `undefined: undefined` in the heading is the shape this guards.
    expect(errorMessage(report({ error: { name: 'RangeError' } as never }))).toBe('RangeError')
    expect(errorMessage(report({ error: {} as never }))).toBe('')
  })

  it('DROPS trace entries missing prev or next', () => {
    // Every heuristic reads both. A half-entry would compare `undefined`
    // and produce a shape-flip finding out of nothing.
    const parsed = parseErrorReport(JSON.stringify({
      error: 'e',
      reactiveTrace: [
        { name: 'good', prev: '1', next: '2' },
        { name: 'no-next', prev: '1' },
        { name: 'no-prev', next: '2' },
        null,
        'string',
        42,
      ],
    }))
    expect(parsed?.reactiveTrace?.map((e) => e.name)).toEqual(['good'])
  })

  it('keeps an entry with no NAME — an unlabelled signal is ordinary', () => {
    const parsed = parseErrorReport('{"error":"e","reactiveTrace":[{"prev":"1","next":"2"}]}')
    expect(parsed?.reactiveTrace).toHaveLength(1)
  })

  it('ignores a non-array reactiveTrace and non-object props', () => {
    expect(parseErrorReport('{"error":"e","reactiveTrace":"nope"}')?.reactiveTrace).toBeUndefined()
    expect(parseErrorReport('{"error":"e","props":"nope"}')?.props).toBeUndefined()
    expect(parseErrorReport('{"error":"e","phase":9}')?.phase).toBeUndefined()
  })
})

describe('an EMPTY trace is itself a verdict', () => {
  it('says the failure is not state-driven, with high confidence', () => {
    // The most valuable thing this tool says: it stops an assistant
    // spending a session hunting a reactive bug that is not there.
    const f = analyze(report({ reactiveTrace: [] })).find((x) => x.code === 'empty-trace')
    expect(f?.confidence).toBe('high')
    expect(f?.detail).toContain('NOT state-driven')
  })

  it('says the same when there is no trace field at all', () => {
    expect(codes(report())).toEqual(['empty-trace'])
  })

  it('emits NOTHING else — an empty trace cannot support another finding', () => {
    expect(codes(report({ reactiveTrace: [] }))).toEqual(['empty-trace'])
  })
})

describe('the nullish-then-crash heuristic correlates the trace with the MESSAGE', () => {
  it('fires when a signal named in the error was just set nullish', () => {
    // The classic: `user` reset to null, then `Cannot read 'name' of null`.
    const found = analyze(report({
      // The message has to NAME the signal — that correlation IS the
      // heuristic. A generic "of null" message is deliberately not
      // enough, or every nullish write in the trace would be blamed.
      error: { message: "Cannot read properties of null (reading 'name') at user.name" } as never,
      reactiveTrace: [write('user', '{id:1}', 'null')],
    }))
    expect(found.map((f) => f.code)).toContain('nullish-then-crash')
    expect(found.find((f) => f.code === 'nullish-then-crash')?.detail).toContain('user')
  })

  it('matches the name case-insensitively', () => {
    expect(codes(report({
      error: { message: 'cannot read USERPROFILE' } as never,
      reactiveTrace: [write('userProfile', '{}', 'undefined')],
    }))).toContain('nullish-then-crash')
  })

  it('does NOT fire when the nullish signal is unrelated to the error', () => {
    // The confidently-wrong direction. Naming an innocent signal sends
    // the assistant to guard an access that was never the problem.
    expect(codes(report({
      error: { message: 'fetch failed' } as never,
      reactiveTrace: [write('sidebarOpen', 'true', 'null')],
    }))).not.toContain('nullish-then-crash')
  })

  it('does not fire for a non-nullish write, however suggestive the name', () => {
    expect(codes(report({
      error: { message: 'user is broken' } as never,
      reactiveTrace: [write('user', 'null', '{id:1}')],
    }))).not.toContain('nullish-then-crash')
  })
})

describe('the write-storm heuristic scales its confidence with the count', () => {
  // No default on `name`: passing `undefined` to a defaulted parameter
  // takes the default, so the anonymous case would never be exercised.
  const storm = (n: number, name?: string) =>
    analyze(report({
      reactiveTrace: Array.from({ length: n }, (_, i) => write(name, String(i), String(i + 1))),
    }))

  it('stays quiet below the threshold', () => {
    // Seven writes in a window is ordinary. Reporting a loop here is the
    // crying-wolf direction.
    expect(storm(7, 'count').map((f) => f.code)).not.toContain('write-storm')
  })

  it('fires at the threshold with MEDIUM confidence', () => {
    const f = storm(8, 'count').find((x) => x.code === 'write-storm')
    expect(f?.confidence).toBe('medium')
    expect(f?.detail).toContain('8 times')
  })

  it('escalates to HIGH at double the threshold', () => {
    // The confidence is what decides whether the assistant rewrites the
    // effect or merely mentions it.
    expect(storm(16, 'count').find((x) => x.code === 'write-storm')?.confidence).toBe('high')
  })

  it('counts per signal, not across the whole trace', () => {
    // Four different signals written four times each is not a storm;
    // summing them would report one.
    const trace = ['a', 'b', 'c', 'd'].flatMap((n) =>
      Array.from({ length: 4 }, (_, i) => write(n, String(i), String(i + 1))),
    )
    expect(codes(report({ reactiveTrace: trace }))).not.toContain('write-storm')
  })

  it('names an UNLABELLED signal "(anonymous)", not undefined', () => {
    // `"undefined" was written 12 times` reads as a real signal name and
    // sends the assistant looking for it.
    const f = storm(12).find((x) => x.code === 'write-storm')
    expect(f?.detail).toContain('(anonymous)')
    expect(f?.detail).not.toContain('undefined')
  })
})

describe('the type-flip heuristic classifies value shapes', () => {
  const flip = (prev: string, next: string) =>
    codes(report({ reactiveTrace: [write('items', prev, next)] }))

  it('fires on every genuine shape change', () => {
    for (const [prev, next] of [
      ['Array(3)', 'null'],
      ['"text"', '{a:1}'],
      ['42', 'Array(0)'],
      ['{a:1}', '"text"'],
      ['true', 'undefined'],
      ['User {id:1}', 'null'],
    ] as Array<[string, string]>) {
      expect(flip(prev, next), `${prev} → ${next}`).toContain('type-flip')
    }
  })

  it('stays quiet when the shape is unchanged', () => {
    // A value change within one shape is the normal case; reporting it
    // would fire on nearly every trace.
    for (const [prev, next] of [
      ['Array(3)', 'Array(5)'],
      ['"a"', '"b"'],
      ['1', '-2'],
      ['null', 'undefined'],
      ['true', 'false'],
    ] as Array<[string, string]>) {
      expect(flip(prev, next), `${prev} → ${next}`).not.toContain('type-flip')
    }
  })

  it('stays quiet when EITHER side is unclassifiable', () => {
    // Guessing from a preview it does not recognise is how a wrong
    // hypothesis gets stated with a straight face.
    expect(flip('Map(3)', 'Array(1)')).not.toContain('type-flip')
    expect(flip('Array(1)', 'Symbol(x)')).not.toContain('type-flip')
  })

  it('carries LOW confidence — it is a correlation, not a cause', () => {
    const f = analyze(report({ reactiveTrace: [write('items', 'Array(3)', 'null')] }))
      .find((x) => x.code === 'type-flip')
    expect(f?.confidence).toBe('low')
  })

  it('reports the flip ONCE even across many entries', () => {
    const trace = Array.from({ length: 5 }, (_, i) => write(`s${i}`, 'Array(1)', '"x"'))
    expect(codes(report({ reactiveTrace: trace })).filter((c) => c === 'type-flip')).toHaveLength(1)
  })
})

describe('the dossier reads usefully however sparse the report', () => {
  it('names the error, the phase and the component when it has them', () => {
    const out = buildErrorDossier(report({
      error: { name: 'TypeError', message: 'x is not a function', stack: 'at foo (a.ts:1:1)' } as never,
      phase: 'render',
      component: 'UserCard',
      reactiveTrace: [write('user', '{}', 'null')],
    }))
    expect(out).toContain('TypeError: x is not a function')
    expect(out).toContain('UserCard')
    expect(out).toContain('at foo')
    expect(out).toContain('user')
  })

  it('says "(no message)" rather than leaving the heading blank', () => {
    // Neither field present. With only `name`, `errorMessage` falls back
    // to it and the message is that name — which is the branch above.
    const out = buildErrorDossier(report({ error: {} as never }))
    expect(out).toContain('(no message)')
    expect(out).not.toContain('undefined')
  })

  it('defaults the error NAME rather than printing undefined', () => {
    const out = buildErrorDossier(report({ error: { message: 'just a message' } as never }))
    expect(out).toContain('Error: just a message')
  })

  it('handles a report with only a string error', () => {
    expect(() => buildErrorDossier(report({ error: 'plain' as never }))).not.toThrow()
    expect(buildErrorDossier(report({ error: 'plain' as never }))).toContain('plain')
  })

  it('numbers the trace so an assistant can refer to a step', () => {
    const out = buildErrorDossier(report({
      reactiveTrace: [write('a', '1', '2'), write(undefined, '2', '3')],
    }))
    expect(out).toContain('1. a: 1 → 2')
    expect(out).toContain('2. (anonymous): 2 → 3')
  })

  it('produces a dossier with no trace at all', () => {
    // The common case for a server-side throw. It must still report the
    // error rather than returning nothing.
    const out = buildErrorDossier(report())
    expect(out).toContain('boom')
  })
})
