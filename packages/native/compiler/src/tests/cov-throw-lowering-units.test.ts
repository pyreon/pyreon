// The pure analyses behind `try`/`throw` lowering, at the IR level. These decide whether a Swift helper is `throws`
// and therefore whether every caller needs `try` — a wrong answer is a swiftc error (missing `try`) or a silently
// terminating app (an uncaught throw lowered as `try!`). The end-to-end emit is locked in `native-throw-try.test.ts`;
// this covers the statement kinds and catch/finally combinations the emit corpus does not reach.

import { describe, expect, it } from 'vitest'
import {
  computeThrowingFunctions,
  containsAwait,
  rewriteCaughtMessage,
  statementsThrowUncaught,
  statementsUseThrow,
} from '../throw-lowering'
import type { ExprIR, StatementIR } from '../types'

const id = (name: string): ExprIR => ({ kind: 'identifier', name })
const call = (name: string): ExprIR => ({ kind: 'call', callee: id(name), args: [] })
const exprStmt = (e: ExprIR): StatementIR => ({ kind: 'expr', expr: e }) as StatementIR
const THROW: StatementIR = { kind: 'throw', message: { kind: 'literal', value: 'x' } } as StatementIR
const none = new Set<string>()

describe('statementsThrowUncaught', () => {
  it('a throw directly in the body escapes', () => {
    expect(statementsThrowUncaught([THROW], none)).toBe(true)
  })

  it('a try WITHOUT catch lets its body escape (finally only)', () => {
    const s = { kind: 'try', body: [THROW], finallyBody: [] } as unknown as StatementIR
    expect(statementsThrowUncaught([s], none)).toBe(true)
  })

  it('a caught body does not escape, but a throw in the catch or the finally does', () => {
    const caught = { kind: 'try', body: [THROW], catchBody: [] } as unknown as StatementIR
    expect(statementsThrowUncaught([caught], none)).toBe(false)
    const rethrows = { kind: 'try', body: [], catchBody: [THROW] } as unknown as StatementIR
    expect(statementsThrowUncaught([rethrows], none)).toBe(true)
    const finallyThrows = { kind: 'try', body: [], catchBody: [], finallyBody: [THROW] } as unknown as StatementIR
    expect(statementsThrowUncaught([finallyThrows], none)).toBe(true)
  })

  it('a call to a throwing helper in a statement`s own expressions escapes, for every statement kind', () => {
    const t = new Set(['boom'])
    const shapes: StatementIR[] = [
      { kind: 'let', name: 'x', expr: call('boom') } as unknown as StatementIR,
      { kind: 'assign', target: id('x'), value: call('boom') } as unknown as StatementIR,
      { kind: 'if', cond: call('boom'), then: [] } as unknown as StatementIR,
      { kind: 'while', cond: call('boom'), body: [] } as unknown as StatementIR,
      { kind: 'do-while', cond: call('boom'), body: [] } as unknown as StatementIR,
      { kind: 'return', expr: call('boom') } as unknown as StatementIR,
      exprStmt(call('boom')),
      { kind: 'for-of', name: 'i', iterable: call('boom'), body: [] } as unknown as StatementIR,
      { kind: 'for-range', name: 'i', from: call('boom'), to: id('n'), step: id('s'), body: [] } as unknown as StatementIR,
      { kind: 'switch', discriminant: id('d'), cases: [{ tests: [call('boom')], body: [] }] } as unknown as StatementIR,
      { kind: 'throw', message: call('boom') } as unknown as StatementIR,
    ]
    for (const s of shapes) expect(statementsThrowUncaught([s], t), s.kind).toBe(true)
  })

  it('a bare return and a statement kind with no expressions are not throwing', () => {
    expect(statementsThrowUncaught([{ kind: 'return' } as unknown as StatementIR], new Set(['boom']))).toBe(false)
    expect(statementsThrowUncaught([{ kind: 'break' } as unknown as StatementIR], new Set(['boom']))).toBe(false)
  })

  it('a throw nested in an if / else / loop / switch body escapes', () => {
    const nested: StatementIR[] = [
      { kind: 'if', cond: id('c'), then: [], elseBody: [THROW] } as unknown as StatementIR,
      { kind: 'for-of', name: 'i', iterable: id('xs'), body: [THROW] } as unknown as StatementIR,
      { kind: 'switch', discriminant: id('d'), cases: [{ tests: [], body: [THROW] }] } as unknown as StatementIR,
    ]
    for (const s of nested) expect(statementsThrowUncaught([s], none), s.kind).toBe(true)
  })

  it('a throwing call inside a nested arrow is that arrow`s own throw context', () => {
    const arrow: ExprIR = { kind: 'arrow', params: [], body: call('boom') } as unknown as ExprIR
    expect(statementsThrowUncaught([exprStmt(arrow)], new Set(['boom']))).toBe(false)
  })

  it('JSON.parse counts as throwing', () => {
    expect(statementsThrowUncaught([exprStmt({ kind: 'json-parse', text: id('s') } as unknown as ExprIR)], none)).toBe(true)
  })
})

describe('statementsUseThrow', () => {
  it('finds a try or throw at any depth, and nothing in plain code', () => {
    expect(statementsUseThrow([exprStmt(id('x'))])).toBe(false)
    expect(statementsUseThrow([{ kind: 'while', cond: id('c'), body: [THROW] } as unknown as StatementIR])).toBe(true)
    expect(statementsUseThrow([{ kind: 'try', body: [], catchBody: [] } as unknown as StatementIR])).toBe(true)
  })
})

describe('computeThrowingFunctions', () => {
  it('closes over calls: a helper calling a throwing helper throws too, a catching one does not', () => {
    const fns = [
      { name: 'outer', body: [exprStmt(call('middle'))] },
      { name: 'middle', body: [exprStmt(call('leaf'))] },
      { name: 'leaf', body: [THROW] },
      { name: 'safe', body: [{ kind: 'try', body: [exprStmt(call('leaf'))], catchBody: [] } as unknown as StatementIR] },
      { name: 'pure', body: [exprStmt(id('x'))] },
    ]
    expect([...computeThrowingFunctions(fns)].sort()).toEqual(['leaf', 'middle', 'outer'])
  })
})

describe('rewriteCaughtMessage', () => {
  it('rewrites `e.message`, `(e).message` and `String(e)`, and leaves an arrow that rebinds `e` alone', () => {
    const body: StatementIR[] = [
      exprStmt({ kind: 'member', object: id('e'), property: 'message' } as unknown as ExprIR),
      exprStmt({ kind: 'member', object: { kind: 'paren', inner: id('e') }, property: 'message' } as unknown as ExprIR),
      exprStmt({ kind: 'call', callee: id('String'), args: [id('e')] } as unknown as ExprIR),
      exprStmt({ kind: 'arrow', params: ['e'], body: { kind: 'member', object: id('e'), property: 'message' } } as unknown as ExprIR),
      exprStmt({ kind: 'member', object: id('other'), property: 'message' } as unknown as ExprIR),
    ]
    const out = rewriteCaughtMessage(body, 'e') as unknown as { expr: Record<string, unknown> }[]
    expect(out[0]!.expr).toEqual({ kind: 'call', callee: id('pyreonErrorMessage'), args: [id('e')] })
    expect(out[1]!.expr).toEqual({ kind: 'call', callee: id('pyreonErrorMessage'), args: [id('e')] })
    expect(out[2]!.expr).toEqual({ kind: 'call', callee: id('pyreonErrorString'), args: [id('e')] })
    expect(out[3]!.expr).toBe(body[3]!.kind === 'expr' ? (body[3] as { expr: unknown }).expr : undefined)
    expect(out[4]!.expr).toEqual({ kind: 'member', object: id('other'), property: 'message' })
  })
})

describe('containsAwait', () => {
  it('sees an await outside nested arrows only', () => {
    expect(containsAwait([exprStmt({ kind: 'await', expr: id('p') } as unknown as ExprIR)])).toBe(true)
    expect(containsAwait([exprStmt({ kind: 'arrow', params: [], body: { kind: 'await', expr: id('p') } } as unknown as ExprIR)])).toBe(false)
    expect(containsAwait(null)).toBe(false)
  })
})
