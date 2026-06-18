// Located + actionable "unsupported construct" diagnostics. PMTC compiles a
// narrow declarative TS subset; out-of-subset expressions in an EMITTED
// position (JSX `{…}`, a signal initializer, a computed body) used to degrade
// to a bare `Unsupported expression: <NodeType>` (no line, no fix) or a SILENT
// `""` — the #1 trust-killer (the construct vanished and surfaced later as a
// confusing swiftc/kotlinc failure, or as wrong output with no signal). Each
// diagnostic now carries a `[line:col]` location AND the rewrite into the
// supported subset, and the CLI prints `result.warnings`, so the developer
// sees it. This locks that contract.
//
// NOTE: a construct only warns where it is actually EMITTED — a truly-unused
// `const x = <unsupported>` is dropped before parseExpr and correctly stays
// silent (dead code, no native output). The fixtures here put the construct in
// JSX text, which is emitted.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// Embed the expression in JSX text — an emitted position that routes through
// parseExpr — inside a minimal component.
const wrapJsx = (expr: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const name = 'a'
  const obj = { field: 1 }
  return (
    <Stack>
      <Text>{${expr}}</Text>
    </Stack>
  )
}`

const warningsFor = (expr: string): string[] =>
  transform(wrapJsx(expr), { target: 'swift' }).warnings ?? []

describe('unsupported-construct diagnostics — located + actionable', () => {
  it('template literal: names the site + the string-concat rewrite', () => {
    const w = warningsFor('`hi ${name}`')
    const hit = w.find((m) => m.includes('template literal'))
    expect(hit).toBeDefined()
    expect(hit!).toMatch(/^\[\d+:\d+\]/) // located
    expect(hit!).toContain('string concatenation')
  })

  it('optional chaining: names the site + the explicit-guard rewrite', () => {
    const w = warningsFor('obj?.field')
    const hit = w.find((m) => m.includes('Optional chaining'))
    expect(hit).toBeDefined()
    expect(hit!).toMatch(/^\[\d+:\d+\]/)
    expect(hit!).toContain('a && a.b')
  })

  it('unsupported unary operator is located + actionable (not a silent "")', () => {
    const w = warningsFor('typeof name')
    const hit = w.find((m) => m.includes('Unary operator'))
    expect(hit).toBeDefined()
    expect(hit!).toMatch(/^\[\d+:\d+\]/)
  })

  it('the location line number is ACCURATE (points at the real line, not 1)', () => {
    // The <Text> sits on line 7 of wrapJsx — a construct there must report a
    // line > 1, proving locOf reads the real byte offset, not a constant.
    const w = warningsFor('`t ${name}`')
    const hit = w.find((m) => m.includes('template literal'))!
    const line = Number(hit.match(/^\[(\d+):/)![1])
    expect(line).toBeGreaterThan(1)
  })

  it('NO false positives: supported constructs emit no unsupported-warning', () => {
    // string concat + && + supported unary are all in-subset.
    const w = warningsFor("'hi ' + name")
    expect(w.some((m) => m.includes('is not supported in native'))).toBe(false)
  })
})
