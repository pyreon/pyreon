// `optional-narrowing.ts` over the statement kinds the native feature wave added after its coverage matrix
// (`cov-narrowing-c-2026-09.test.ts`) was written: `throw`, `try`/`catch`/`finally`, and `switch` inside a narrowed
// branch or after a guard. A narrowed optional must be rewritten to its binder through these bodies too, and a
// shape that would change meaning (a catch binding that SHADOWS the binder) must decline rather than mis-bind.

import { describe, expect, it } from 'vitest'
import { emptyInferenceCtx } from '../infer-type'
import type { InferenceCtx } from '../infer-type'
import { narrowStmts, planGuard } from '../optional-narrowing'
import type { ExprIR, StatementIR, TypeIR } from '../types'

const id = (name: string): ExprIR => ({ kind: 'identifier', name })
const lit = (value: string | number | boolean | null): ExprIR => ({ kind: 'literal', value })
const mem = (object: ExprIR, property: string): ExprIR => ({ kind: 'member', object, property })
const opt = (t: TypeIR): TypeIR => ({ kind: 'union', branches: [t, { kind: 'undefined' }] })
const eqNull = (e: ExprIR): ExprIR => ({ kind: 'comparison', op: '==', left: e, right: lit(null) })
const ret = (e?: ExprIR): StatementIR => (e === undefined ? { kind: 'return' } : { kind: 'return', expr: e })
const expr = (e: ExprIR): StatementIR => ({ kind: 'expr', expr: e })
/** An arrow that rebinds `name` — `narrowExpr` refuses to rewrite through it. */
const shadowing = (name: string): ExprIR => ({ kind: 'arrow', params: [name], body: mem(id(name), 'x') }) as unknown as ExprIR

const subject = id('b')
const len = mem(id('b'), 'length')
const bLen = mem(id('bb'), 'length')

describe('narrowStmts through throw / try / switch', () => {
  it('a throw message is rewritten; a bare throw is kept as is', () => {
    const out = narrowStmts([{ kind: 'throw', message: len } as StatementIR, { kind: 'throw' } as StatementIR], subject, 'bb')
    expect(out).toEqual([{ kind: 'throw', message: bLen }, { kind: 'throw' }])
  })

  it('a throw whose message cannot be rewritten declines the whole list', () => {
    expect(narrowStmts([{ kind: 'throw', message: shadowing('b') } as StatementIR], subject, 'bb')).toBeNull()
  })

  it('a try rewrites its body, catch and finally; absent arms stay absent', () => {
    const full = { kind: 'try', body: [expr(len)], catchParam: 'e', catchBody: [expr(len)], finallyBody: [expr(len)] } as unknown as StatementIR
    expect(narrowStmts([full], subject, 'bb')).toEqual([
      { kind: 'try', body: [expr(bLen)], catchParam: 'e', catchBody: [expr(bLen)], finallyBody: [expr(bLen)] },
    ])
    const bodyOnly = { kind: 'try', body: [expr(len)], finallyBody: [] } as unknown as StatementIR
    expect(narrowStmts([bodyOnly], subject, 'bb')).toEqual([{ kind: 'try', body: [expr(bLen)], finallyBody: [] }])
    const noFinally = { kind: 'try', body: [], catchBody: [expr(len)] } as unknown as StatementIR
    expect(narrowStmts([noFinally], subject, 'bb')).toEqual([{ kind: 'try', body: [], catchBody: [expr(bLen)] }])
  })

  it('a catch binding that shadows the binder declines (it would be read as the caught error)', () => {
    const s = { kind: 'try', body: [], catchParam: 'bb', catchBody: [expr(len)] } as unknown as StatementIR
    expect(narrowStmts([s], subject, 'bb')).toBeNull()
  })

  it('any arm of a try that cannot be rewritten declines', () => {
    for (const arm of ['body', 'catchBody', 'finallyBody'] as const) {
      const s = { kind: 'try', body: [], catchBody: [], finallyBody: [], [arm]: [expr(shadowing('b'))] } as unknown as StatementIR
      expect(narrowStmts([s], subject, 'bb'), arm).toBeNull()
    }
  })

  it('a switch rewrites its discriminant, tests and bodies, and declines on any part that cannot be', () => {
    const sw = { kind: 'switch', discriminant: len, cases: [{ tests: [len], body: [expr(len)] }] } as unknown as StatementIR
    expect(narrowStmts([sw], subject, 'bb')).toEqual([
      { kind: 'switch', discriminant: bLen, cases: [{ tests: [bLen], body: [expr(bLen)] }] },
    ])
    const badDisc = { kind: 'switch', discriminant: shadowing('b'), cases: [] } as unknown as StatementIR
    expect(narrowStmts([badDisc], subject, 'bb')).toBeNull()
    const badTest = { kind: 'switch', discriminant: lit(1), cases: [{ tests: [shadowing('b')], body: [] }] } as unknown as StatementIR
    expect(narrowStmts([badTest], subject, 'bb')).toBeNull()
  })
})

describe('planGuard: the rest after a guard is read through throw / try / switch', () => {
  const ctx = (): InferenceCtx => {
    const c = emptyInferenceCtx()
    c.locals.set('b', opt({ kind: 'array', element: { kind: 'string' } }))
    return c
  }
  const guard: StatementIR = { kind: 'if', cond: eqNull(id('b')), then: [ret(lit(0))] }

  it('a subject read only inside a later throw / try / switch still makes the guard narrow', () => {
    const rests: StatementIR[][] = [
      [{ kind: 'throw', message: len } as StatementIR],
      [{ kind: 'try', body: [ret(len)], catchBody: [ret(lit(1))], finallyBody: [] } as unknown as StatementIR],
      [{ kind: 'try', body: [], catchBody: [ret(len)] } as unknown as StatementIR],
      [{ kind: 'try', body: [], finallyBody: [expr(len)] } as unknown as StatementIR],
      [{ kind: 'switch', discriminant: lit(1), cases: [{ tests: [len], body: [] }] } as unknown as StatementIR],
    ]
    for (const rest of rests) {
      const plan = planGuard(guard, rest, ctx(), undefined)
      expect(plan, JSON.stringify(rest)).not.toBeNull()
      expect(plan!.binder).toBe('b')
    }
  })

  it('a rest with a bare throw and no read of the subject does not narrow', () => {
    expect(planGuard(guard, [{ kind: 'throw' } as StatementIR], ctx(), undefined)).toBeNull()
  })
})
