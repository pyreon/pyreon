// `planViewBlock` decides whether a block-bodied render callback has a view-builder spelling (the `{(row) => { const x =
// …; if (c) return <A/>; return <B/> }}` shape), and `narrowViewBlock` rewrites a narrowed optional through it. Both are
// pure IR decisions; this pins every arm, including the declines the caller turns into a named warning.

import { describe, expect, it } from 'vitest'
import { narrowViewBlock, planViewBlock, viewBlockExprs, viewBlockLocals, viewBlockViews } from '../render-slots'
import type { ExprIR, StatementIR } from '../types'

const id = (name: string): ExprIR => ({ kind: 'identifier', name })
const lit = (value: string | number | boolean | null): ExprIR => ({ kind: 'literal', value })
const mem = (object: ExprIR, property: string): ExprIR => ({ kind: 'member', object, property })
const view = (tag: string): ExprIR => ({ kind: 'jsx-element', tag, attrs: [], children: [] }) as unknown as ExprIR
const ret = (e?: ExprIR): StatementIR => (e === undefined ? { kind: 'return' } : { kind: 'return', expr: e })
const letS = (name: string, expr: ExprIR, extra: Record<string, unknown> = {}): StatementIR =>
  ({ kind: 'let', name, expr, ...extra }) as unknown as StatementIR
const ifS = (cond: ExprIR, then: StatementIR[], elseBody?: StatementIR[]): StatementIR =>
  (elseBody ? { kind: 'if', cond, then, elseBody } : { kind: 'if', cond, then }) as StatementIR
const shadowing = (name: string): ExprIR => ({ kind: 'arrow', params: [name], body: mem(id(name), 'x') }) as unknown as ExprIR

describe('planViewBlock', () => {
  it('empty, a bare return, and `return null` are all the empty view', () => {
    expect(planViewBlock([])).toEqual({ kind: 'empty' })
    expect(planViewBlock([ret()])).toEqual({ kind: 'empty' })
    expect(planViewBlock([ret({ kind: 'paren', inner: lit(null) } as unknown as ExprIR)])).toEqual({ kind: 'empty' })
  })

  it('const locals then an if/else that both return plan into a tree', () => {
    const b = planViewBlock([letS('x', id('a')), ifS(id('c'), [ret(view('A'))], [ret(view('B'))])])!
    expect(b.kind).toBe('let')
    expect(viewBlockViews(b)).toEqual([view('A'), view('B')])
    expect(viewBlockExprs(b)).toEqual([id('a'), id('c'), view('A'), view('B')])
    expect(viewBlockLocals(b)).toEqual(['x'])
  })

  it('an if without else continues with the statements after it', () => {
    const b = planViewBlock([ifS(id('c'), [ret(view('A'))]), ret(view('B'))])!
    expect(b).toEqual({ kind: 'if', cond: id('c'), then: { kind: 'view', expr: view('A') }, otherwise: { kind: 'view', expr: view('B') } })
  })

  it('declines a mutable or method-mutated local, a fall-through if, a non-exiting else, and any other statement', () => {
    expect(planViewBlock([letS('x', id('a'), { mutable: true }), ret(view('A'))])).toBeNull()
    expect(planViewBlock([letS('x', id('a'), { methodMutated: true }), ret(view('A'))])).toBeNull()
    expect(planViewBlock([ifS(id('c'), [{ kind: 'expr', expr: id('x') } as StatementIR]), ret(view('A'))])).toBeNull()
    expect(planViewBlock([ifS(id('c'), [ret(view('A'))], [{ kind: 'expr', expr: id('x') } as StatementIR])])).toBeNull()
    expect(planViewBlock([{ kind: 'expr', expr: id('x') } as StatementIR])).toBeNull()
    // A declining tail declines the whole block, through a let and through an if.
    expect(planViewBlock([letS('x', id('a')), { kind: 'expr', expr: id('x') } as StatementIR])).toBeNull()
    expect(planViewBlock([ifS(id('c'), [ret(view('A'))]), { kind: 'expr', expr: id('x') } as StatementIR])).toBeNull()
  })
})

describe('narrowViewBlock', () => {
  const subject = id('b')
  const block = planViewBlock([letS('n', mem(id('b'), 'name')), ifS(mem(id('b'), 'on'), [ret(view('A'))]), ret(lit(null))])!

  it('rewrites every read of the subject to the binder', () => {
    const out = narrowViewBlock(block, subject, 'bb')!
    expect(viewBlockExprs(out)).toEqual([mem(id('bb'), 'name'), mem(id('bb'), 'on'), view('A')])
  })

  it('declines when the block declares the binder name', () => {
    expect(narrowViewBlock(block, subject, 'n')).toBeNull()
  })

  it('declines when a let, an if condition, or a view cannot be rewritten', () => {
    const bad = shadowing('b')
    expect(narrowViewBlock(planViewBlock([letS('n', bad), ret(view('A'))])!, subject, 'bb')).toBeNull()
    expect(narrowViewBlock(planViewBlock([ifS(bad, [ret(view('A'))]), ret(view('B'))])!, subject, 'bb')).toBeNull()
    expect(narrowViewBlock(planViewBlock([ret(bad)])!, subject, 'bb')).toBeNull()
  })
})
