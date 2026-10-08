import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import type { StatementIR, TypeIR } from '../types'
import { isKotlincAvailable, validateKotlin } from '../validate'

const source = `import { signal } from '@pyreon/reactivity'
import { useCallback } from '@acme/callbacks'
export function CallbackApp() {
  const sink = signal('')
  const local = signal(7)
  const callback = useCallback()
  return <Text>{local()}</Text>
}`

function compile(fail = false) {
  let after: TypeIR | undefined
  let thrown: string | undefined
  const body: StatementIR[] = [
    { kind: 'let', name: 'local', expr: { kind: 'identifier', name: 'input' } },
    ...(fail
      ? [
          {
            kind: 'expr' as const,
            expr: {
              kind: 'ext-expr' as const,
              plugin: '@acme/callbacks',
              type: 'fail',
              payload: {},
              args: [],
            },
          },
        ]
      : [
          {
            kind: 'if' as const,
            cond: { kind: 'identifier' as const, name: 'local' },
            then: [
              {
                kind: 'return' as const,
                expr: {
                  kind: 'call' as const,
                  callee: {
                    kind: 'member' as const,
                    object: { kind: 'identifier' as const, name: 'sink' },
                    property: 'set',
                  },
                  args: [{ kind: 'literal' as const, value: 'ready' }],
                },
              },
            ],
          },
        ]),
  ]
  const plugin: CompilerPlugin = {
    name: '@acme/callbacks',
    apiVersion: 1,
    modules: ['@acme/callbacks'],
    calls: { useCallback: () => ({ type: 'callback' }) },
    exprs: {
      fail: {
        swift: () => {
          throw new Error('callback failed')
        },
        kotlin: () => {
          throw new Error('callback failed')
        },
      },
    },
    decls: {
      callback: {
        swift: () => '',
        kotlin(_decl, ctx) {
          let lines: string[] = []
          try {
            lines = ctx.statements(
              body,
              4,
              new Map<string, TypeIR>([['input', { kind: 'string' }]]),
              {
                kotlin: { returnLabel: 'acmeDone', discardReturnValue: true },
              },
            )
            if (fail) throw new Error('failure control did not fire')
          } catch (error) {
            if (!fail) throw error
            thrown = String(error)
          }
          after = ctx.inferType({ kind: 'identifier', name: 'local' })
          return `val callback: (String) -> Unit = acmeDone@ { input ->\n${lines.map((line) => `    ${line}`).join('\n')}\n  }`
        },
      },
    },
  }
  return {
    result: createCompiler({ plugins: [plugin] }).transform(source, { target: 'kotlin' }),
    after,
    thrown,
  }
}

it('an independent plugin emits typed local conditions and a local void return', () => {
  const { result } = compile()
  expect(result.code).toContain('(local).isNotEmpty()')
  expect(result.code).toMatch(/sink = "ready"\s+return@acmeDone/)
  expect(result.code).not.toContain('return@acmeDone sink =')
})

it('callback locals restore the enclosing numeric signal type', () => {
  expect(compile().after).toEqual({ kind: 'number' })
})

it('callback locals restore after an owning expression emitter throws', () => {
  const result = compile(true)
  expect(result.thrown).toContain('callback failed')
  expect(result.after).toEqual({ kind: 'number' })
})

it('the independent callback compiles with real kotlinc', (ctx) => {
  if (!isKotlincAvailable()) return ctx.skip()
  const result = validateKotlin(compile().result.code)
  expect(result.ok, result.error).toBe(true)
})
