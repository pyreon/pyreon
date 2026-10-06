import { verifyServiceTypes } from '../plugin-verify'

// `verifyServiceTypes` reads declarations out of shipped native sources, so the
// comment/string stripper in front of it decides what counts as "declared".
// These specs pin its semantics AND its cost on hostile input (CodeQL
// js/polynomial-redos: a regex block-comment rule re-scanned to end-of-input
// from every unterminated `/*`).

const plugin = {
  services: { useThing: { swift: 'PyreonThing()', kotlin: ['val {id} = remember { PyreonThing() }'] } },
}
const KOTLIN_OK = 'class PyreonThing'
const swiftFindings = (swift: string) =>
  verifyServiceTypes(plugin, { swiftSources: [swift], kotlinSources: [KOTLIN_OK] }).filter(
    (f) => f.target === 'swift',
  )

describe('comment stripping in plugin verification', () => {
  it('counts a real declaration', () => {
    expect(swiftFindings('final class PyreonThing {}')).toEqual([])
  })

  it('does not count a declaration that only appears inside a block comment', () => {
    expect(swiftFindings('/* final class PyreonThing {} */')).toHaveLength(1)
  })

  it('does not count a declaration that only appears inside a line comment', () => {
    expect(swiftFindings('// final class PyreonThing {}\n')).toHaveLength(1)
  })

  it('a `/*` inside a line comment does not open a block comment over what follows', () => {
    expect(swiftFindings('// see /* docs\nfinal class PyreonThing {}')).toEqual([])
  })

  it('a `/*` inside a string (a URL, a glob) does not open a block comment', () => {
    expect(swiftFindings('let glob = "src/**/*.swift"\nfinal class PyreonThing {}')).toEqual([])
  })

  it('an unterminated `/*` is not a comment, so declarations after it stay visible', () => {
    expect(swiftFindings('/* never closed\nfinal class PyreonThing {}')).toEqual([])
  })

  it('an escaped quote does not end a string early', () => {
    expect(swiftFindings('let s = "a \\" /* b"\nfinal class PyreonThing {}')).toEqual([])
  })

  it('an unterminated string does not swallow the next lines', () => {
    expect(swiftFindings('let s = "oops\nfinal class PyreonThing {}')).toEqual([])
  })

  it('a closed block comment between two declarations hides only its own text', () => {
    const findings = verifyServiceTypes(plugin, {
      swiftSources: ['/* class PyreonThing */ struct Other {}'],
      kotlinSources: [KOTLIN_OK],
    })
    expect(findings.filter((f) => f.target === 'swift')).toHaveLength(1)
  })
})

describe('comment stripping stays linear on hostile input', () => {
  // The quadratic form needs ~tens of seconds at this size; the linear scanner
  // needs milliseconds. The bound is deliberately loose (a loaded CI runner is
  // ~10x slower than a laptop) yet orders of magnitude under the broken form.
  const N = 120_000
  const BUDGET_MS = 3000

  it.each([
    ['unterminated block comments', '/* '.repeat(N)],
    ['unterminated strings with escapes', '"\\'.repeat(N)],
    ['a long line of lone quotes', '" '.repeat(N)],
  ])('%s followed by a declaration', (_name, hostile) => {
    const started = performance.now()
    const findings = swiftFindings(`${hostile}\nfinal class PyreonThing {}`)
    const elapsed = performance.now() - started
    expect(findings).toEqual([])
    expect(elapsed).toBeLessThan(BUDGET_MS)
  })
})
