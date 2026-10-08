import { describe, expect, it } from 'vitest'
import type { AstNode } from '../call-lowering'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import type { DeclIR, TypeIR } from '../types'

type FunctionDecl = Extract<DeclIR, { kind: 'function' }>
type Declaration = {
  id?: { name?: string }
  init?: { callee?: { name?: string }; arguments?: AstNode[] }
}

function moduleCompiler() {
  let method: FunctionDecl | undefined
  let seed: TypeIR | undefined
  const plugin: CompilerPlugin = {
    name: '@acme/module-builders',
    apiVersion: 1,
    modules: ['@acme/module-builders'],
    topLevel(node, ctx) {
      const declaration = node as {
        declarations?: Declaration[]
        declaration?: { declarations?: Declaration[] }
      }
      const d = (declaration.declarations ?? declaration.declaration?.declarations)?.[0]
      if (d?.init?.callee?.name !== 'defineModule' || d.id?.name === undefined) return undefined
      const args = d.init.arguments ?? []
      method = ctx.functionDeclaration('apply', args[0]!)
      seed = ctx.initialType(ctx.expr(args[1]!))
      return { type: 'module', name: d.id.name, payload: { seedKind: seed.kind } }
    },
    items: {
      module: {
        swift: (item) => [`// module ${item.name}: ${item.payload.seedKind}`],
        kotlin: (item) => [`// module ${item.name}: ${item.payload.seedKind}`],
      },
    },
  }
  return { compiler: createCompiler({ discovered: [plugin] }), parsed: () => ({ method, seed }) }
}

describe('generic module declaration builders', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`keeps typed/defaulted function parameters and fractional array seeds on ${target}`, () => {
      const { compiler, parsed } = moduleCompiler()
      const result = compiler.transform(
        `import { defineModule } from '@acme/module-builders'
        export const MathModule = defineModule((amount: number = 2): number => amount * 2, [0.5, 1.5])`,
        { target },
      )
      expect(result.code).toContain('// module MathModule: array')
      expect(parsed().method).toMatchObject({
        kind: 'function',
        name: 'apply',
        params: [
          { name: 'amount', type: { kind: 'number' }, defaultValue: { kind: 'literal', value: 2 } },
        ],
        returnType: { kind: 'number' },
      })
      expect(parsed().seed).toEqual({ kind: 'array', element: { kind: 'number', float: true } })
    })

    it(`accepts a function expression and preserves a negative fractional seed on ${target}`, () => {
      const { compiler, parsed } = moduleCompiler()
      compiler.transform(
        `import { defineModule } from '@acme/module-builders'
        const MathModule = defineModule(function (amount: number): number { return amount }, -0.5)`,
        { target },
      )
      expect(parsed().method?.params).toEqual([{ name: 'amount', type: { kind: 'number' } }])
      expect(parsed().seed).toEqual({ kind: 'number', float: true })
    })
  }

  it('names the plugin when a recognizer passes a non-function node to the builder', () => {
    const { compiler } = moduleCompiler()
    expect(() =>
      compiler.transform(
        `import { defineModule } from '@acme/module-builders'
      const Broken = defineModule(42, 0)`,
        { target: 'swift' },
      ),
    ).toThrow(/module-builders.*topLevel.*function node/)
  })
})
