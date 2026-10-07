import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import type { DeclIR, ExprIR } from '../types'

const READ: ExprIR = { kind: 'call', callee: { kind: 'identifier', name: 'amount' }, args: [] }
const OWNER_READ: ExprIR = {
  kind: 'call',
  callee: { kind: 'member', object: { kind: 'identifier', name: 'owner' }, property: 'amount' },
  args: [],
}
const FIELD: DeclIR = { kind: 'signal', name: 'amount', type: { kind: 'number', float: true }, initial: { kind: 'literal', value: 0.5 } }
const METHOD: Extract<DeclIR, { kind: 'function' }> = {
  kind: 'function', name: 'calculate',
  params: [{ name: 'value', type: { kind: 'number' } }],
  returnType: { kind: 'number', float: true },
  body: [{ kind: 'return', expr: { kind: 'binary', op: '+', left: READ, right: { kind: 'identifier', name: 'value' } } }],
}

function scopedCompiler(throws: boolean) {
  const plugin: CompilerPlugin = {
    name: '@acme/member-scope', apiVersion: 1,
    topLevel(node) {
      const n = node as { declarations?: { id?: { name?: string } }[] }
      return n.declarations?.[0]?.id?.name === 'ExampleModule' ? { type: 'module', name: 'ExampleModule' } : undefined
    },
    items: {
      module: {
        swift(_item, ctx) { return emit(ctx) },
        kotlin(_item, ctx) { return emit(ctx) },
      },
    },
  }
  function emit(ctx: Parameters<NonNullable<CompilerPlugin['items']>[string]['swift']>[1]) {
    const outside = ctx.expr(READ)
    const output = ctx.memberScope({ name: 'ExampleModule', declarations: [FIELD, METHOD], receiver: 'owner' }, () => {
      expect(ctx.inferType(READ)).toEqual({ kind: 'number', float: true })
      expect(ctx.inferType(OWNER_READ)).toEqual({ kind: 'number', float: true })
      expect(ctx.expr(READ)).toBe('amount')
      expect(ctx.expr(OWNER_READ)).toBe('amount')
      expect(ctx.expr({ kind: 'call', callee: { kind: 'identifier', name: 'calculate' }, args: [{ kind: 'literal', value: 2 }] })).toBe(ctx.target === 'swift' ? 'calculate(2)' : 'calculate(2L)')
      expect(ctx.argument({ kind: 'literal', value: 2 }, { kind: 'number', float: true })).toBe(ctx.target === 'swift' ? 'Double(2)' : '(2L).toDouble()')
      expect(ctx.argument({ kind: 'array', elements: [{ kind: 'literal', value: 2 }] }, { kind: 'array', element: { kind: 'number', float: true } })).toBe(ctx.target === 'swift' ? '([2]).map { Double($0) }' : '(listOf(2L)).map { it.toDouble() }')
      const method = ctx.functionDeclaration(METHOD)
      const beforeNested = ctx.expr(OWNER_READ)
      try {
        ctx.memberScope({ name: 'OtherModule', declarations: [], receiver: 'other' }, () => {
          expect(ctx.expr(READ)).toBe(outside)
          expect(ctx.inferType(READ).kind).toBe('unknown')
          if (throws) throw new Error('controlled nested emit failure')
        })
      } catch (error) {
        expect((error as Error).message).toBe('controlled nested emit failure')
      }
      expect(ctx.expr(OWNER_READ)).toBe(beforeNested)
      expect(ctx.inferType(READ)).toEqual({ kind: 'number', float: true })
      return method
    })
    expect(ctx.expr(READ)).toBe(outside)
    expect(ctx.inferType(READ).kind).toBe('unknown')
    return [output]
  }
  return createCompiler({ discovered: [plugin] })
}

describe('generic member emission scopes', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    for (const throws of [false, true]) {
      it(`restores nested declaration/receiver/type state on ${target}, throwing=${throws}`, () => {
        const result = scopedCompiler(throws).transform('const ExampleModule = 0', { target })
        expect(result.code).toContain(target === 'swift' ? 'func calculate(_ value: Int) -> Double { amount + Double(value) }' : 'fun calculate(value: Long): Double = amount + value')
      })
    }
  }
})
