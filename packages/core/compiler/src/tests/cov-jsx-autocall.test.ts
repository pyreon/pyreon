/**
 * Branch coverage — `jsx.ts` SIGNAL AUTO-CALL: which occurrences of a tracked
 * signal name get `()` appended, and every position/scope that must be left
 * bare. A scope-blind rewrite here emitted `1()` at runtime, so each spec
 * asserts the rewritten source directly.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const SIG = 'const count = signal(0)\n'
const t = (src: string) => transformJSX_JS(SIG + src, 'in.tsx').code
const bothAgree = (src: string) => {
  const js = transformJSX_JS(SIG + src, 'in.tsx').code
  expect(transformJSX(SIG + src, 'in.tsx').code).toBe(js)
  return js
}
/** The body of the accessor, with the leading `const count = signal(0)` gone. */
const body = (src: string) => t(src).split('signal(0)')[1] ?? ''

describe('jsx.ts — positions where a signal name must NOT be auto-called', () => {
  it('`count.set(1)` in a handler is a METHOD call on the signal object', () => {
    const out = bothAgree('export const A = () => <button onClick={() => count.set(1)}>x</button>')
    expect(out).toContain('count.set(1)')
    expect(out).not.toContain('count().set(1)')
  })

  it('`count.peek()` is left alone too', () => {
    expect(body('export const A = () => <div>{() => count.peek() + 1}</div>')).toContain(
      'count.peek()',
    )
  })

  it('a bare member READ (`count.value`) IS auto-called — that reads the value`s property', () => {
    expect(body('export const A = () => <div>{() => count.value + 1}</div>')).toContain(
      'count().value',
    )
  })

  it('a PROPERTY NAME position (`o.count`) is left alone', () => {
    const out = body('export const A = () => <div>{() => o.count + 1}</div>')
    expect(out).toContain('o.count + 1')
    expect(out).not.toContain('o.count()')
  })

  it('an ALREADY-CALLED occurrence is not called twice', () => {
    const out = body('export const A = () => <div>{() => count() + 1}</div>')
    expect(out).toContain('count() + 1')
    expect(out).not.toContain('count()()')
  })

  it('a SHORTHAND object property is left alone (`{ count() }` is a method shorthand)', () => {
    const out = body('export const A = () => <div style={() => ({ count })}>x</div>')
    expect(out).toContain('{ count }')
    expect(out).not.toContain('{ count() }')
  })

  it('an object KEY position is left alone', () => {
    const out = body('export const A = () => <div style={() => ({ count: 1 })}>x</div>')
    expect(out).toContain('{ count: 1 }')
  })

  it('a COMPUTED key IS auto-called (it is a value position)', () => {
    expect(body('export const A = () => <div style={() => ({ [count]: 1 })}>x</div>')).toContain(
      '[count()]',
    )
  })

  it('a DECLARATOR id position is left alone', () => {
    const out = body('export const A = () => <div>{() => { let count = 1; return count }}</div>')
    expect(out).not.toContain('let count() =')
  })
})

describe('jsx.ts — lexical shadowing inside the rewritten expression', () => {
  const inner = (expr: string) => body(`export const A = () => <div>{() => ${expr}}</div>`)

  it('an OBJECT-PATTERN callback parameter shadows', () => {
    expect(inner('xs.map(({ count }) => count + 1)')).toContain('count + 1')
  })

  it('a RENAMED object-pattern parameter shadows the local name', () => {
    expect(inner('xs.map(({ a: count }) => count + 1)')).toContain('count + 1')
  })

  it('an OBJECT-PATTERN REST parameter shadows', () => {
    expect(inner('xs.map(({ a, ...count }) => count + 1)')).toContain('...count }) => count + 1')
  })

  it('an ARRAY-PATTERN parameter shadows', () => {
    expect(inner('xs.map(([count]) => count + 1)')).toContain('[count]) => count + 1')
  })

  it('a DEFAULTED parameter shadows', () => {
    expect(inner('xs.map((count = 1) => count + 1)')).toContain('count = 1) => count + 1')
  })

  it('a REST parameter shadows', () => {
    expect(inner('xs.map((...count) => count + 1)')).toContain('...count) => count + 1')
  })

  it('a BLOCK-level `const` shadows', () => {
    expect(inner('{ const count = 1; return count + 1 }')).toContain('return count + 1')
  })

  it('a BLOCK-level FUNCTION DECLARATION shadows', () => {
    expect(inner('{ function count() {}; return count + 1 }')).toContain('return count + 1')
  })

  it('a BLOCK-level CLASS DECLARATION shadows', () => {
    expect(inner('{ class count {}; return count + 1 }')).toContain('return count + 1')
  })

  it('a CATCH parameter shadows', () => {
    expect(inner('{ try {} catch (count) { return count + 1 } }')).toContain('return count + 1')
  })

  it('a `for (let count …)` head shadows', () => {
    expect(inner('{ for (let count = 0;;) { g(count + 1) } }')).toContain('g(count + 1)')
  })

  it('a `for…of` head shadows', () => {
    expect(inner('{ for (const count of xs) { g(count + 1) } }')).toContain('g(count + 1)')
  })

  it('a `for…in` head shadows', () => {
    expect(inner('{ for (const count in xs) { g(count + 1) } }')).toContain('g(count + 1)')
  })

  it('a block re-declaration that is ITSELF `signal()` is NOT a shadow', () => {
    expect(inner('{ const count = signal(1); return count + 1 }')).toContain('count() + 1')
  })

  it('an UNSHADOWED occurrence in the same expression is still called', () => {
    expect(inner('xs.map(({ other }) => count + other)')).toContain('count() + other')
  })
})

describe('jsx.ts — `isBareDomBinding`: bare signals stay bare only for DOM targets', () => {
  it('a bare signal DOM attribute stays bare (the runtime handles the accessor)', () => {
    const out = t('export const A = () => <div title={count}>x</div>')
    expect(out).toContain('_bindDirect(count,')
    expect(out).not.toContain('_bindDirect(count(),')
  })

  it('a bare signal COMPONENT attribute IS auto-called into a reactive prop', () => {
    const out = t('export const A = () => <Comp title={count} />')
    expect(out).toContain('_rp(() => count())')
  })

  it('a bare signal DOM child is auto-called inside the emitted accessor', () => {
    expect(t('export const A = () => <div>{count}</div>')).toContain('() => (count())')
  })

  it('a bare signal under a MEMBER-tag parent is auto-called (not a DOM target)', () => {
    expect(t('export const A = () => <Ctx.Provider title={count} />')).toContain('count()')
  })

  it('a signal inside a LARGER expression is always called', () => {
    expect(t('export const A = () => <div title={count + 1}>x</div>')).toContain('count() + 1')
  })
})

describe('jsx.ts — the auto-call pass is skipped when nothing can need it', () => {
  it('a module with NO tracked signals is left byte-identical by the pass', () => {
    const out = transformJSX_JS('export const A = () => <div>{other}</div>', 'in.tsx').code
    expect(out).toContain('_setChild(__root, other)')
  })

  it('a module whose only signal is fully shadowed is too', () => {
    const out = transformJSX_JS(
      `${SIG}function A(count) { return <div>{count}</div> }`,
      'in.tsx',
    ).code
    expect(out).toContain('_setChild(__root, count)')
  })
})
