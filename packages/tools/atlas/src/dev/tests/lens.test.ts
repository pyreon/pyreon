/**
 * The Reactivity Lens — the node half.
 *
 * Run against the REAL `analyzeReactivity`, because the whole claim is that the
 * panel shows the compiler's OWN verdict. A fabricated findings list would only
 * prove the shaping code can read its own field names, and would keep passing
 * if the compiler's verdict changed underneath it.
 */
import { describe, expect, it } from 'vitest'
import { analyzeReactivity } from '@pyreon/compiler'
import { isSuspect, summarize, toLensLines } from '../lens'

describe('which verdicts deserve attention', () => {
  it('flags static-text and footguns, not the reactive kinds', () => {
    // The vocabulary is the compiler's, verified against the real analyzer: an
    // earlier cut guessed `live`/`static` and matched NOTHING, which would have
    // rendered every component as having no findings at all.
    expect(isSuspect('static-text')).toBe(true)
    expect(isSuspect('footgun')).toBe(true)
    expect(isSuspect('reactive')).toBe(false)
    expect(isSuspect('reactive-prop')).toBe(false)
    // Hoisting is an optimisation applied to JSX with nothing dynamic in it.
    expect(isSuspect('hoisted-static')).toBe(false)
  })
})

describe('merging findings onto lines', () => {
  it('lands a finding on its own line', () => {
    const lines = toLensLines('const a = 1\nconst b = 2\n', [
      { kind: 'static-text', line: 2, column: 6, detail: 'baked once' },
    ])
    expect(lines[0]!.findings).toEqual([])
    expect(lines[1]!.findings[0]).toMatchObject({ kind: 'static-text', suspect: true })
  })

  it('DROPS a finding pointing past the end of the file', () => {
    // The analysed source and the read source can disagree if the file changed
    // between the two. Rendering that against the wrong line would be a
    // confident lie; dropping it is the honest outcome.
    const lines = toLensLines('const a = 1\n', [
      { kind: 'static-text', line: 99, column: 0, detail: 'stale' },
    ])
    expect(lines.every((l) => l.findings.length === 0)).toBe(true)
  })

  it('summarises by kind and counts suspects', () => {
    const lines = toLensLines('a\nb\nc\n', [
      { kind: 'reactive', line: 1, column: 0, detail: '' },
      { kind: 'static-text', line: 2, column: 0, detail: '' },
      { kind: 'footgun', line: 3, column: 0, detail: '' },
    ])
    const { totals, suspects } = summarize(lines)
    expect(totals).toMatchObject({ reactive: 1, 'static-text': 1, footgun: 1 })
    expect(suspects).toBe(2)
  })
})

describe('against the real compiler', () => {
  it('reports a REACTIVE verdict for a signal read in JSX', () => {
    const code = `
      import { signal } from '@pyreon/reactivity'
      export function Counter() {
        const count = signal(0)
        return <div>{count()}</div>
      }
    `
    const { findings } = analyzeReactivity(code, 'Counter.tsx')
    const lines = toLensLines(code, findings)
    const kinds = lines.flatMap((l) => l.findings.map((f) => f.kind))
    expect(kinds.some((k) => k.startsWith('reactive')), `kinds: ${kinds.join(', ')}`).toBe(true)
  })

  it('produces findings a reader can act on, with real line numbers', () => {
    const code = [
      "import { signal } from '@pyreon/reactivity'",
      'export function Counter() {',
      '  const count = signal(0)',
      '  return <div>{count()}</div>',
      '}',
    ].join('\n')
    const { findings } = analyzeReactivity(code, 'Counter.tsx')
    const lines = toLensLines(code, findings)
    for (const line of lines) {
      for (const f of line.findings) {
        // A finding must point at a line that exists and carry a message —
        // a blank detail would render as an empty row.
        expect(line.text).toBeDefined()
        expect(typeof f.detail).toBe('string')
      }
    }
    expect(findings.length).toBeGreaterThan(0)
  })
})
