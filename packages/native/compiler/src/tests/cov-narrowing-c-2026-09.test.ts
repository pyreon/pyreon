// Branch-coverage matrix for `optional-narrowing.ts` — the pure decision
// module both emitters consult to narrow an optional through a nil /
// truthiness test.
//
// These are direct unit tests over hand-built IR: every function here is a
// pure decision (which condition narrows, what the binder is called, which
// statement shapes can be rewritten to read the binder), so the IR is the
// contract. Each spec pairs the shape that takes an arm with the neighbour
// that must not.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { emptyInferenceCtx } from '../infer-type'
import type { InferenceCtx } from '../infer-type'
import {
  binderName,
  exits,
  isNarrowablePath,
  narrowStmts,
  narrowingFor,
  planGuard,
  stmtExprs,
  truthinessFor,
  unnarrowableSubject,
} from '../optional-narrowing'
import type { ExprIR, StatementIR, TypeIR } from '../types'

const id = (name: string): ExprIR => ({ kind: 'identifier', name })
const lit = (value: string | number | boolean | null): ExprIR => ({ kind: 'literal', value })
const call = (callee: ExprIR, args: ExprIR[] = []): ExprIR => ({ kind: 'call', callee, args })
const mem = (object: ExprIR, property: string): ExprIR => ({ kind: 'member', object, property })
const opt = (t: TypeIR): TypeIR => ({ kind: 'union', branches: [t, { kind: 'undefined' }] })
const eqNull = (e: ExprIR): ExprIR => ({ kind: 'comparison', op: '==', left: e, right: lit(null) })
const not = (e: ExprIR): ExprIR => ({ kind: 'unary', op: '!', argument: e })
const ret = (e?: ExprIR): StatementIR => (e === undefined ? { kind: 'return' } : { kind: 'return', expr: e })
const sel = call(id('sel'))

function ctxWith(locals: Record<string, TypeIR>, signals: Record<string, TypeIR> = {}): InferenceCtx {
  const ctx = emptyInferenceCtx()
  for (const [k, v] of Object.entries(locals)) ctx.locals.set(k, v)
  for (const [k, v] of Object.entries(signals)) ctx.signals.set(k, v)
  return ctx
}

describe('optional-narrowing — truthiness extra per payload type', () => {
  it('a number payload needs the `!= 0` extra; a boolean needs `!= false`; an array none', () => {
    const ctx = ctxWith({ n: opt({ kind: 'number' }), f: opt({ kind: 'boolean' }), xs: opt({ kind: 'array', element: { kind: 'string' } }) })
    expect(narrowingFor(id('n'), ctx, undefined)?.truth).toBe('number')
    expect(narrowingFor(id('f'), ctx, undefined)?.truth).toBe('boolean')
    expect(narrowingFor(id('xs'), ctx, undefined)?.truth).toBeNull()
  })

  it('truthinessFor keeps a number/boolean truth test and drops a nil-only one', () => {
    const ctx = ctxWith({ n: opt({ kind: 'number' }) })
    expect(truthinessFor(not(id('n')), ctx, undefined)?.truth).toBe('number')
    // `n == null` is a nil test, not a truthiness test.
    expect(truthinessFor(eqNull(id('n')), ctx, undefined)).toBeNull()
  })
})

describe('optional-narrowing — `null == x` with the literal on the LEFT', () => {
  it('takes the right operand as the subject', () => {
    const ctx = ctxWith({ n: opt({ kind: 'string' }) })
    const cond: ExprIR = { kind: 'comparison', op: '!=', left: lit(null), right: id('n') }
    const n = narrowingFor(cond, ctx, undefined)
    expect(n?.subject).toEqual(id('n'))
    expect(n?.presentWhenTrue).toBe(true)
  })

  it('`null == null` narrows nothing (both sides literal)', () => {
    const cond: ExprIR = { kind: 'comparison', op: '==', left: lit(null), right: lit(null) }
    expect(narrowingFor(cond, ctxWith({}), undefined)).toBeNull()
  })
})

describe('optional-narrowing — binderName', () => {
  it('a call subject binds to the signal name; a non-path subject to `value`', () => {
    expect(binderName(sel, [])).toBe('sel')
    expect(binderName({ kind: 'index', object: id('xs'), index: lit(0) }, [])).toBe('value')
  })

  it('a member subject binds to its property — or `<name>Value` when a reader already uses that name', () => {
    const subject = mem(id('b'), 'tags')
    expect(binderName(subject, [mem(subject, 'length')])).toBe('tags')
    // A reader that also names an unrelated `tags` local would be shadowed.
    const reader: ExprIR = { kind: 'binary', op: '+', left: mem(subject, 'length'), right: mem(id('tags'), 'length') }
    expect(binderName(subject, [reader])).toBe('tagsValue')
  })

  it('a member whose root is a call resolves the root through the callee', () => {
    const subject = mem(call(id('sel')), 'title')
    expect(binderName(subject, [])).toBe('title')
  })
})

describe('optional-narrowing — unnarrowableSubject', () => {
  const find = call(mem(call(id('items')), 'find'), [
    { kind: 'arrow', params: [{ name: 'i' }], body: lit(true) } as unknown as ExprIR,
  ])
  const ctx = (): InferenceCtx => {
    const c = emptyInferenceCtx()
    c.signals.set('items', { kind: 'array', element: { kind: 'string' } })
    return c
  }

  it('a narrowable path is never "unnarrowable"', () => {
    expect(unnarrowableSubject(id('n'), [id('n')], ctxWith({ n: opt({ kind: 'string' }) }), undefined)).toBeNull()
  })

  it('a `.find(…)` subject read again by a reader is named; one no reader repeats is not', () => {
    const c = ctx()
    expect(unnarrowableSubject(find, [mem(find, 'length')], c, undefined)).toEqual(find)
    expect(unnarrowableSubject(find, [id('other')], c, undefined)).toBeNull()
  })
})

describe('optional-narrowing — exits()', () => {
  it('an empty list does not exit; return / break / continue do', () => {
    expect(exits([])).toBe(false)
    expect(exits([{ kind: 'break' }])).toBe(true)
    expect(exits([{ kind: 'continue' }])).toBe(true)
    expect(exits([{ kind: 'expr', expr: id('x') }])).toBe(false)
  })

  it('an if exits only when BOTH arms exit', () => {
    expect(exits([{ kind: 'if', cond: id('c'), then: [ret()], elseBody: [ret()] }])).toBe(true)
    expect(exits([{ kind: 'if', cond: id('c'), then: [ret()], elseBody: [] }])).toBe(false)
    expect(exits([{ kind: 'if', cond: id('c'), then: [ret()] }])).toBe(false)
  })
})

describe('optional-narrowing — narrowStmts statement arms', () => {
  const subject = id('b')
  const len = mem(subject, 'length')
  const n = (stmts: StatementIR[]) => narrowStmts(stmts, subject, 'bb')

  it('rewrites a read inside every statement kind to the binder', () => {
    const out = n([
      { kind: 'let', name: 'x', expr: len },
      { kind: 'assign', target: id('y'), op: '=', value: len },
      { kind: 'if', cond: len, then: [ret(len)], elseBody: [{ kind: 'expr', expr: len }] },
      { kind: 'if', cond: len, then: [ret()] },
      { kind: 'while', cond: len, body: [{ kind: 'break' }] },
      { kind: 'do-while', cond: len, body: [{ kind: 'continue' }] },
      { kind: 'for-of', item: 'it', iterable: subject, body: [] },
      { kind: 'for-range', item: 'i', from: lit(0), to: len, body: [] },
      { kind: 'for-range', item: 'j', from: lit(0), to: len, step: len, body: [] },
      { kind: 'switch', discriminant: len, cases: [{ tests: [len], body: [ret(len)] }, { tests: [], body: [] }] },
      { kind: 'declare', name: 'z', declaredType: { kind: 'number' } },
    ])
    expect(out).not.toBeNull()
    const json = JSON.stringify(out)
    expect(json).not.toContain('"name":"b"')
    expect(json).toContain('"name":"bb"')
    // The optional step survives only where it was written.
    expect(out![7]).not.toHaveProperty('step')
    expect(out![8]).toHaveProperty('step')
  })

  it('refuses a local / loop item / declaration that re-declares the binder name', () => {
    expect(n([{ kind: 'declare', name: 'bb', declaredType: { kind: 'number' } }])).toBeNull()
    expect(n([{ kind: 'let', name: 'bb', expr: lit(1) }])).toBeNull()
    expect(n([{ kind: 'for-of', item: 'bb', iterable: id('xs'), body: [] }])).toBeNull()
    expect(n([{ kind: 'for-range', item: 'bb', from: lit(0), to: lit(3), body: [] }])).toBeNull()
  })

  it('refuses an assignment TO the subject (the binding is a copy)', () => {
    expect(n([{ kind: 'assign', target: mem(subject, 'x'), op: '=', value: lit(1) }])).toBeNull()
  })

  it('propagates a refusal from a nested body in every container', () => {
    const bad: StatementIR = { kind: 'let', name: 'bb', expr: lit(1) }
    expect(n([{ kind: 'if', cond: lit(true), then: [], elseBody: [bad] }])).toBeNull()
    expect(n([{ kind: 'while', cond: lit(true), body: [bad] }])).toBeNull()
    expect(n([{ kind: 'for-of', item: 'q', iterable: id('xs'), body: [bad] }])).toBeNull()
    expect(n([{ kind: 'for-range', item: 'q', from: lit(0), to: lit(1), body: [bad] }])).toBeNull()
    expect(n([{ kind: 'switch', discriminant: lit(1), cases: [{ tests: [lit(1)], body: [bad] }] }])).toBeNull()
  })

  it('refuses a branch that WRITES the signal subject (`sel.set(…)`)', () => {
    const write: StatementIR = { kind: 'expr', expr: call(mem(id('sel'), 'set'), [lit(null)]) }
    expect(narrowStmts([write], sel, 'sel')).toBeNull()
    const update: StatementIR = { kind: 'expr', expr: call(mem(id('sel'), 'update'), [id('f')]) }
    expect(narrowStmts([update], sel, 'sel')).toBeNull()
    // Writing a DIFFERENT signal, or a non-setter member of the same one, is fine.
    expect(narrowStmts([{ kind: 'expr', expr: call(mem(id('other'), 'set'), [lit(1)]) }], sel, 'sel')).not.toBeNull()
    expect(narrowStmts([{ kind: 'expr', expr: call(mem(id('sel'), 'peek')) }], sel, 'sel')).not.toBeNull()
  })

  it('a non-call subject never counts as a signal write', () => {
    const write: StatementIR = { kind: 'expr', expr: call(mem(id('b'), 'set'), [lit(1)]) }
    expect(narrowStmts([write], subject, 'bb')).not.toBeNull()
  })
})

describe('optional-narrowing — planGuard', () => {
  const ctx = (): InferenceCtx => ctxWith({ b: opt({ kind: 'array', element: { kind: 'string' } }) })
  const guard: StatementIR = { kind: 'if', cond: eqNull(id('b')), then: [ret(lit(0))] }

  it('plans a guard whose rest reads the subject, rewriting the rest to the binder', () => {
    const plan = planGuard(guard, [ret(mem(id('b'), 'length'))], ctx(), undefined)
    expect(plan?.binder).toBe('b')
    expect(plan?.exitBody).toEqual([ret(lit(0))])
    expect(plan?.rest).toEqual([ret(mem(id('b'), 'length'))])
  })

  it('declines: an else arm, a non-exiting body, a presence guard, an unreading rest, a rest that cannot rewrite', () => {
    expect(planGuard({ ...guard, elseBody: [] } as StatementIR, [ret(id('b'))], ctx(), undefined)).toBeNull()
    expect(planGuard({ kind: 'if', cond: eqNull(id('b')), then: [] }, [ret(id('b'))], ctx(), undefined)).toBeNull()
    const presence: StatementIR = { kind: 'if', cond: { kind: 'comparison', op: '!=', left: id('b'), right: lit(null) }, then: [ret(lit(0))] }
    expect(planGuard(presence, [ret(id('b'))], ctx(), undefined)).toBeNull()
    expect(planGuard(guard, [ret(lit(1))], ctx(), undefined)).toBeNull()
    expect(
      planGuard(guard, [{ kind: 'assign', target: mem(id('b'), 'x'), op: '=', value: lit(1) }], ctx(), undefined),
    ).toBeNull()
    expect(planGuard({ kind: 'expr', expr: id('b') }, [], ctx(), undefined)).toBeNull()
  })
})

describe('optional-narrowing — stmtExprs walks every container', () => {
  it('collects expressions from switch tests + bodies and for-range steps, skipping declares', () => {
    const out = stmtExprs([
      { kind: 'switch', discriminant: id('d'), cases: [{ tests: [id('t')], body: [{ kind: 'expr', expr: id('inCase') }] }] },
      { kind: 'for-range', item: 'i', from: id('from'), to: id('to'), step: id('step'), body: [] },
      { kind: 'declare', name: 'z', declaredType: { kind: 'number' } },
      { kind: 'return' },
    ])
    expect(out.map((e) => (e.kind === 'identifier' ? e.name : '?'))).toEqual(['d', 't', 'inCase', 'from', 'to', 'step'])
  })
})

describe('optional-narrowing — isNarrowablePath', () => {
  it('rejects `undefined`, the props param itself, and a call with arguments', () => {
    expect(isNarrowablePath(id('undefined'), undefined)).toBe(false)
    expect(isNarrowablePath(id('props'), 'props')).toBe(false)
    expect(isNarrowablePath(mem(id('props'), 'x'), 'props')).toBe(true)
    expect(isNarrowablePath(call(id('f'), [lit(1)]), undefined)).toBe(false)
    expect(isNarrowablePath({ kind: 'index', object: id('xs'), index: lit(0) }, undefined)).toBe(false)
  })
})

describe('optional-narrowing — a guarded `switch` reads the BINDER in its discriminant (bug fix)', () => {
  // `narrowStmt`'s switch arm computed the rewritten discriminant and then
  // returned `{ ...s, cases }`, keeping the ORIGINAL — so after
  // `if (b.tags === undefined) return 0` the switch still read the optional
  // `b.tags`: `switch b.tags.count` (Swift: optional must be unwrapped) and
  // `when (b.tags.length)` (Kotlin: a `var` field cannot smart-cast).
  const src = `type Book = { title: string; tags?: string[] }
export function App() {
  const tagCount = (b: Book): number => {
    if (b.tags === undefined) return 0
    switch (b.tags.length) {
      case 0: return 1
      default: return b.tags.length
    }
  }
  return <Text>{tagCount({ title: 'a' })}</Text>
}`

  it('Swift: `switch tags.count` after `guard let tags = b.tags`', () => {
    const code = transform(src, { target: 'swift' }).code
    expect(code).toContain('guard let tags = b.tags else {')
    expect(code).toContain('switch tags.count {')
    expect(code).not.toContain('switch b.tags')
  })

  it('Kotlin: `when (tags.length)` after `val tags = b.tags ?: run`', () => {
    const code = transform(src, { target: 'kotlin' }).code
    expect(code).toContain('val tags = b.tags ?: run {')
    expect(code).toContain('when (tags.length) {')
    expect(code).not.toContain('when (b.tags')
  })

  it('the pure rewrite replaces the discriminant too', () => {
    const subject = mem(id('b'), 'tags')
    const out = narrowStmts(
      [{ kind: 'switch', discriminant: mem(subject, 'length'), cases: [{ tests: [], body: [] }] }],
      subject,
      'tags',
    )
    expect(out![0]).toMatchObject({ kind: 'switch', discriminant: { kind: 'member', object: { kind: 'identifier', name: 'tags' } } })
  })
})
