import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin, type ExprEmitter, type ExprIR } from '../index'
import { forEachExpr } from '../expr-walk'

// A plugin may recognize a declaration by the SHAPE of its callee (`declCalls`) rather than a hook name, and answer with a plain
// COMPUTED around its own expression. The expression is typed from its parts (`typing.type(e, infer)`), may declare itself a
// reduction (`reduce`, so an integer seed is widened to a Double like an array `reduce`'s), and its argument slots are walked
// like any other expression. A toy library proves each seam is library-agnostic.
const expr = (withReduce: boolean): ExprEmitter => ({
  swift: (e, ctx) => `${ctx.expr(e.args[0]!)}.${(e.payload as { op: string }).op}(${e.args.slice(1).map((a) => ctx.expr(a)).join(', ')})`,
  kotlin: (e, ctx) => `${ctx.expr(e.args[0]!)}.${(e.payload as { op: string }).op}(${e.args.slice(1).map((a) => ctx.expr(a)).join(', ')})`,
  typing: {
    type(e, infer) {
      const source = infer(e.args[0]!)
      const op = (e.payload as { op: string }).op
      if (op === 'take') return { kind: 'array', element: source.kind === 'array' ? source.element : { kind: 'unknown' } }
      return { kind: 'number' }
    },
  },
  ...(withReduce
    ? {
        reduce: (e: Parameters<NonNullable<ExprEmitter['reduce']>>[0]) =>
          (e.payload as { op: string }).op === 'fold' ? { source: e.args[0]!, reducer: e.args[1]!, seed: e.args[2]! } : undefined,
      }
    : {}),
})

const toy = (withReduce = true): CompilerPlugin => ({
  name: '@acme/seq',
  apiVersion: 1,
  modules: ['@acme/seq'],
  scanModule: (scan) => {
    const names = scan.fileState('@acme/seq:names', () => new Map<string, string>())
    for (const node of scan.body as readonly { type: string; source?: { value: string }; specifiers?: { imported?: { name: string }; local?: { name: string } }[] }[]) {
      if (node.type !== 'ImportDeclaration' || node.source?.value !== '@acme/seq') continue
      for (const spec of node.specifiers ?? []) if (spec.imported && spec.local) names.set(spec.local.name, spec.imported.name)
    }
  },
  declCalls: (site, ctx) => {
    const callee = site.callee as { type: string; name?: string }
    if (callee.type !== 'Identifier') return undefined
    const op = ctx.fileState('@acme/seq:names', () => new Map<string, string>()).get(callee.name!)
    if (op === undefined) return undefined
    if (site.args.length === 0) {
      ctx.warn(`${op} needs a source.`)
      return null
    }
    const source: ExprIR = { kind: 'call', callee: ctx.expr(site.args[0]!), args: [] }
    return { computed: { type: 'seq', payload: { op }, args: [source, ...site.args.slice(1).map((a) => ctx.expr(a))] } }
  },
  exprs: { seq: expr(withReduce) },
})

const SRC = `import { signal } from '@pyreon/reactivity'
import { take as grab, fold } from '@acme/seq'
import { Stack, Text } from '@pyreon/primitives'
import { take } from './mine'
export function App() {
  const nums = signal([1, 2, 3])
  const prices = signal<{ price: number }[]>([{ price: 1.5 }])
  const firstTwo = grab(nums, 2)
  const own = take(nums, 2)
  const nothing = grab()
  const total = fold(prices, (acc, p) => acc + p.price, 0)
  return (<Stack><Text>{String(firstTwo().length + own + total())}</Text></Stack>)
}`

const run = (target: 'swift' | 'kotlin', plugin: CompilerPlugin) => createCompiler({ plugins: [plugin] }).transform(SRC, { target })

describe('declCalls', () => {
  it('declares a computed around the plugin expression, resolving the callee through the import', () => {
    const swift = run('swift', toy()).code
    expect(swift).toContain('nums.take(2)')
    // `take` from `./mine` is not the plugin's: it declines and falls to the parser's own chain.
    expect(swift).not.toContain('var own: [Int]')
    expect(run('kotlin', toy()).code).toContain('nums.take(2L)')
  })

  it('types the computed from its parts through `typing.type(e, infer)`', () => {
    expect(run('swift', toy()).code).toContain('var firstTwo: [Int]')
  })

  it('a recognizer that returns null claims the call: it warns and nothing is declared', () => {
    const r = run('swift', toy())
    expect(r.warnings.some((w) => w.includes('Declaration nothing: grab') || w.includes('needs a source'))).toBe(true)
    expect(r.code).not.toContain('nothing')
  })
})

describe('ExprEmitter.reduce', () => {
  it('widens an integer seed over a fractional accumulation, as an array reduce does', () => {
    expect(run('swift', toy(true)).code).toContain('prices.fold({ acc, p in acc + p.price }, 0.0)')
  })

  it('leaves the seed alone without it', () => {
    expect(run('swift', toy(false)).code).toContain('prices.fold({ acc, p in acc + p.price }, 0)')
  })
})

describe('forEachExpr over an ext-expr', () => {
  it('visits its argument slots', () => {
    const seen: string[] = []
    const lit = (value: number): ExprIR => ({ kind: 'literal', value })
    forEachExpr({ kind: 'ext-expr', plugin: 'p', type: 't', payload: {}, args: [lit(1), { kind: 'paren', inner: lit(2) }] }, (n) => seen.push(n.kind))
    expect(seen).toEqual(['ext-expr', 'literal', 'paren', 'literal'])
  })
})
