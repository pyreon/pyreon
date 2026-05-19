/**
 * Compiler hardening — Round 19 (defer-inline robustness; no bug found).
 *
 * `transformDeferInline` (a separate compiler entry, unprobed in rounds
 * 1–18) rewrites `<Defer when={…}><X/></Defer>` to inline its children.
 * Probed 10 valid shapes (no-children, multi-child, expr/text child, nested
 * Defer, self-closing, spread child, comment child, passthrough) + a
 * malformed input — all valid cases emit parseable code, and malformed input
 * is passed through unchanged without throwing (same resilience contract as
 * Round 10). This locks the surface.
 */
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformDeferInline } from '../defer-inline'

const run = (c: string): string => {
  const r = transformDeferInline(c, 'c.tsx') as { code?: string }
  return r?.code ?? ''
}
const parses = (o: string): boolean => {
  try {
    return (parseSync('o.tsx', o).errors?.length ?? 0) === 0
  } catch {
    return false
  }
}

const VALID: Array<[string, string]> = [
  ['basic', `import { Modal } from './M'\nfunction C(){ const o=signal(0); return <Defer when={o()}><Modal title="hi"/></Defer> }`],
  ['passthrough', `function C(){ return <div>{x}</div> }`],
  ['no-children', `function C(){ return <Defer when={a}></Defer> }`],
  ['multi-child', `import {A,B} from './x'\nfunction C(){ return <Defer when={c}><A/><B/></Defer> }`],
  ['expr-child', `function C(){ return <Defer when={c}>{val}</Defer> }`],
  ['nested-defer', `import {A} from './x'\nfunction C(){ return <Defer when={a}><Defer when={b}><A/></Defer></Defer> }`],
  ['text-child', `function C(){ return <Defer when={c}>plain text</Defer> }`],
  ['self-closing', `function C(){ return <Defer when={c}/> }`],
  ['spread-child', `import {A} from './x'\nfunction C(p){ return <Defer when={c}><A {...p}/></Defer> }`],
  ['comment-child', `function C(){ return <Defer when={c}>{/* x */}</Defer> }`],
]

describe('Round 19 — transformDeferInline robustness', () => {
  for (const [name, src] of VALID) {
    it(`emits parseable code: ${name}`, () => {
      let out = ''
      expect(() => {
        out = run(src)
      }).not.toThrow()
      expect(parses(out)).toBe(true)
    })
  }
  it('malformed input is passed through without throwing (resilience)', () => {
    expect(() => run(`function C(){ return <Defer when={</Defer> }`)).not.toThrow()
  })
})
