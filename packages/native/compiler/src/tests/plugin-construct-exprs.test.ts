import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin, type ExprEmitter } from '../index'

// A plugin may claim a CONSTRUCTION (`new Box<K, V>(…)`) by the name it recorded from its import: the recognizer sees
// `construct`, the type arguments (`ModuleParseContext.typeArgs`) and a location for its message (`loc`), and its
// expression says whether a file-scope const holding it is typed by the expression's own type (`typing.seedsModuleConst`).
// A toy container proves the seam is library-agnostic.
const expr = (seedsModuleConst?: boolean): ExprEmitter => ({
  swift: (e, ctx) => `Box<${ctx.typeText((e.payload as { k: never }).k)}>(cap: ${String(e.payload.cap)})`,
  kotlin: (e, ctx) => `Box<${ctx.typeText((e.payload as { k: never }).k)}>(cap = ${String(e.payload.cap)}L)`,
  typing: {
    type: (e) => ({ kind: 'map', key: (e.payload as { k: never }).k, value: (e.payload as { v: never }).v }),
    ...(seedsModuleConst === undefined ? {} : { seedsModuleConst }),
  },
})

const toy = (seedsModuleConst?: boolean): CompilerPlugin => ({
  name: '@acme/box',
  apiVersion: 1,
  modules: ['@acme/box'],
  scanModule: (scan) => {
    const names = scan.fileState('@acme/box:names', () => new Set<string>())
    for (const node of scan.body as readonly { type: string; source?: { value: string }; specifiers?: { imported?: { name: string }; local?: { name: string } }[] }[]) {
      if (node.type !== 'ImportDeclaration' || node.source?.value !== '@acme/box') continue
      for (const spec of node.specifiers ?? []) if (spec.imported?.name === 'Box' && spec.local) names.add(spec.local.name)
    }
  },
  callExprs: (site, ctx) => {
    const callee = site.callee as { type: string; name?: string }
    if (callee.type !== 'Identifier' || !ctx.fileState('@acme/box:names', () => new Set<string>()).has(callee.name!)) return undefined
    if (site.construct !== true) return undefined
    const typeArgs = ctx.typeArgs(site.node)
    if (typeArgs.length !== 2) return undefined
    const cap = (site.args[0] as { type: string; value?: unknown } | undefined)
    if (cap?.type !== 'Literal') {
      ctx.report(`[${ctx.loc(site.node)}] new ${callee.name}(…) needs a literal capacity.`)
      return null
    }
    return { type: 'box', payload: { k: typeArgs[0]!, v: typeArgs[1]!, cap: cap.value as number } }
  },
  exprs: { box: expr(seedsModuleConst) },
})

const SRC = `import { Box } from '@acme/box'
import { Stack, Text } from '@pyreon/primitives'
const seen = new Box<string, number>(8)
export function App() {
  const own = new Box<string, number>(2)
  const called = Box<string, number>(3)
  const bare = new Box(4)
  const dynamic = new Box<string, number>(seen.size)
  return (<Stack><Text>{String(seen.size)}</Text></Stack>)
}`

const run = (target: 'swift' | 'kotlin', plugin: CompilerPlugin) => createCompiler({ plugins: [plugin] }).transform(SRC, { target })

describe('callExprs over a construction', () => {
  it('lowers the shape it recognizes and declines every other (a call without `new`, the wrong number of type arguments)', () => {
    const swift = run('swift', toy()).code
    expect(swift).toContain('private let seen = Box<String>(cap: 8)')
    expect(swift).toContain('let own = Box<String>(cap: 2)')
    expect(swift).not.toContain('cap: 3')
    expect(swift).not.toContain('cap: 4')
    expect(run('kotlin', toy()).code).toContain('private val seen = Box<String>(cap = 8L)')
  })

  it('names the call it cannot lower, with a location, and the parser does not report it a second time', () => {
    const warnings = run('swift', toy()).warnings.filter((w) => w.includes('literal capacity'))
    expect(warnings).toHaveLength(1)
    // `dynamic` is on line 8 of SRC, after `const dynamic = new Box…` at column 19.
    expect(warnings[0]).toBe('[8:19] new Box(…) needs a literal capacity.')
  })
})

describe('ExprEmitter.typing.seedsModuleConst', () => {
  it('a file-scope const is typed by the expression (a map reads `.size` as `.count`) unless the plugin opts out', () => {
    expect(run('swift', toy()).code).toContain('String(seen.count)')
    expect(run('swift', toy(true)).code).toContain('String(seen.count)')
    expect(run('swift', toy(false)).code).toContain('String(seen.size)')
  })
})
