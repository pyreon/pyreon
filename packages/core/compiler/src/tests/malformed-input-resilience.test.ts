/**
 * Compiler hardening — Round 10 (resilience gate; no bug found).
 *
 * `transformJSX` runs per-file inside the Vite dev server; a throw on
 * malformed input crashes the dev server (the documented contract is "a Rust
 * panic / parse error must not crash Vite — fall back gracefully"). Probed 15
 * adversarial inputs (unclosed/mismatched tags, stray brace, invalid attr,
 * unterminated string, 500-deep nesting, BOM, raw control bytes, empty,
 * comment-only, JSX in type position) through BOTH backends — all returned a
 * `{ code: string }` result without throwing. This locks that resilience so a
 * future change can't regress the compiler into throwing on bad input.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const INPUTS: Array<[string, string]> = [
  ['unclosed-tag', `function C(){ return <div>oops }`],
  ['mismatched-tags', `function C(){ return <div></span> }`],
  ['invalid-attr', `function C(){ return <div class=></div> }`],
  ['stray-brace', `function C(){ return <div>{</div> }`],
  ['empty', ``],
  ['whitespace-only', `   \n  `],
  ['non-jsx-ts', `const x: number = 1; export function f(){ return x }`],
  ['deeply-unbalanced', `function C(){ return <a><b><c></a> }`],
  ['unterminated-string-attr', `function C(){ return <div title="abc>x</div> }`],
  ['huge-nesting-500', `function C(){ return ${'<a>'.repeat(500)}x${'</a>'.repeat(500)} }`],
  ['bom-prefixed', `﻿function C(){ return <div>ok</div> }`],
  ['comment-only', `// just a comment`],
  ['fragment-unclosed', `function C(){ return <>x }`],
  ['raw-control-garbage', String.fromCharCode(0, 1) + ' not code <div'],
]

describe('Round 10 — transform never throws on malformed input (Vite-dev-server resilience)', () => {
  for (const [name, src] of INPUTS) {
    it(`JS backend tolerates: ${name}`, () => {
      let res: { code?: unknown } | undefined
      expect(() => {
        res = transformJSX_JS(src, 'c.tsx')
      }).not.toThrow()
      expect(typeof res?.code).toBe('string')
    })
    it(`native backend tolerates: ${name}`, () => {
      let res: { code?: unknown } | undefined
      expect(() => {
        res = transformJSX(src, 'c.tsx')
      }).not.toThrow()
      expect(typeof res?.code).toBe('string')
    })
  }
})
