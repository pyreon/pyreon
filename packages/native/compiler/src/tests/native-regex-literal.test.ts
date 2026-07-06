// Regex literals (`/pat/flags`) — silent-drop → NAMED warning.
//
// A regex literal is a `Literal` AST node carrying a `regex` field; its
// `node.value` stringifies to the raw `/pat/flags`. Pre-fix `parseExpr`'s
// Literal case returned `{ kind: 'literal', value: <RegExp> }`, so the emit
// wrote the raw `/b/` VERBATIM on both targets — uncompilable (neither Swift
// nor Kotlin has JS regex-literal syntax + `.match`/`.test`/regex-`.replace`;
// Swift uses `Regex`/`.firstMatch(of:)`, Kotlin `Regex(...)`) with ZERO
// warnings. A genuine silent-drop the doc's opening didn't even list.
//
// Faithful regex lowering (flags, capture groups, differing match APIs) is a
// large semantics undertaking; per "faithful OR named-error" this turns the
// silent mis-emit into a NAMED warning + a safe `""` fallback (never the
// uncompilable verbatim regex). String work with STRING args (`.replace("b",
// …)`) is a separate path and stays unaffected.
//
// Bisect-verified by reverting the `regexNode.regex !== undefined` guard in
// parseExpr — the regex literal re-emits verbatim and the warning disappears.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const REGEX_SHAPES: Record<string, string> = {
  'String.match(regex)': `export function App() { const m = "abc".match(/b/); return <Text>{String(m)}</Text> }`,
  'regex.test(s)': `export function App() { const ok = /b/i.test("abc"); return <Text>{String(ok)}</Text> }`,
  'String.replace(regex, …)': `export function App() { const s = "abc".replace(/b/g, "x"); return <Text>{s}</Text> }`,
}

describe('regex literals — NAMED warning + no verbatim emit (both targets)', () => {
  for (const [name, src] of Object.entries(REGEX_SHAPES)) {
    it(`${name}: warns NAMED and never emits the verbatim /…/ on either target`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(src, { target })
        // a NAMED "Regex literals aren't supported" warning fires
        expect(
          (r.warnings ?? []).some((w) => w.includes('Regex literals aren'.concat("'t supported in native"))),
          `${target} warnings: ${JSON.stringify(r.warnings)}`,
        ).toBe(true)
        // the raw regex literal is NOT emitted verbatim (it was uncompilable)
        expect(r.code).not.toMatch(/\/b\/[a-z]*/)
      }
    })
  }

  it('a string-arg .replace (no regex) is unaffected — no warning, still lowers', () => {
    const src = `export function App() { const s = "abc".replace("b", "x"); return <Text>{s}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect((r.warnings ?? []).some((w) => w.includes('Regex literal'))).toBe(false)
    }
  })

  it('ordinary literals (string/number/boolean) are untouched by the regex guard', () => {
    const src = `export function App() { const a = "hi"; const b = 42; const c = true; return <Text>{a}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect((r.warnings ?? []).some((w) => w.includes('Regex literal'))).toBe(false)
      expect(r.code).toContain('"hi"')
      expect(r.code).toContain('42')
    }
  })
})
