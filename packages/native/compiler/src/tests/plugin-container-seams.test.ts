import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import { assertPluginShape } from '../plugin-shape'
import { testNativePlugin } from '../testing'

// Three seams a state-container library needs (`@pyreon/table`, `@pyreon/dnd`), exercised through a toy "shelf"
// library that is neither: `DeclLifecycle.midOrder` (where a container binds closures over the component's own
// state), `EmitContext.rowType` / `rowFields` (how a container element's type spells and what fields it has), and
// `CompilerPlugin.refModifiers` (a modifier derived from an element's `ref`).

const HEAD = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
`

const shelf = (over: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/shelf',
  apiVersion: 1,
  modules: ['@acme/shelf'],
  calls: { useShelf: (_call, ctx) => ({ type: 'shelf', payload: { items: ctx.expr((ctx.args[0] as unknown as { body: never }).body) as never } }) },
  decls: {
    shelf: {
      lifecycle: {
        midOrder: 5,
        swift: (decl) => [`.onAppear { ${decl.name}.mid() }`],
        kotlin: (decl) => [`${decl.name}.mid()`],
      },
      swift(decl, ctx) {
        const element = (ctx.inferType((decl.payload as { items: never }).items) as { element?: never }).element as never
        const fields = ctx.rowFields(element).map((f) => f.name).join(',')
        return `@State private var ${decl.name} = AcmeShelf<${ctx.rowType(element)}>(fields: "${fields}")`
      },
      kotlin(decl, ctx) {
        const element = (ctx.inferType((decl.payload as { items: never }).items) as { element?: never }).element as never
        return `val ${decl.name} = remember { AcmeShelf<${ctx.rowType(element)}>("${ctx.rowFields(element).map((f) => f.name).join(',')}") }`
      },
    },
  },
  refModifiers: {
    swift: (ref, _el, ctx) => (ref.kind === 'member' && ref.property === 'slot' && ctx.decls('@acme/shelf', 'shelf').some((d) => d.name === (ref.object as { name?: string }).name) ? '.acmeSlot()' : undefined),
    kotlin: (ref, _el, ctx) => (ref.kind === 'member' && ref.property === 'slot' && ctx.decls('@acme/shelf', 'shelf').some((d) => d.name === (ref.object as { name?: string }).name) ? '.acmeSlot()' : undefined),
  },
  ...over,
})

const app = (extra = '') => `import { useShelf } from '@acme/shelf'
${HEAD}export function App() {
  const rows = signal([{ id: 1, name: 'a' }])
  const s = useShelf(() => rows())
${extra}  return <Stack><Text ref={s.slot}>x</Text><Text ref={other.slot}>y</Text></Stack>
}`

describe.each(['swift', 'kotlin'] as const)('container seams (%s)', (target) => {
  it('midOrder: the lifecycle is emitted, and the declaration reads the container element through rowType / rowFields', () => {
    const { code } = testNativePlugin(shelf(), app(), { target })
    // Exactly once: a mid lifecycle is neither a head one (emitted first, in declaration order) nor a tail one.
    expect(code.split('s.mid()')).toHaveLength(2)
    // The row struct the component synthesized for the inline object literal, with its fields.
    expect(code).toMatch(target === 'swift' ? /AcmeShelf<\w+>\(fields: "id,name"\)/ : /AcmeShelf<\w+>\("id,name"\)/)
  })

  it('refModifiers: an element whose `ref` binds the plugin declaration gets the modifier; an unrelated ref is left alone', () => {
    const { code } = testNativePlugin(shelf(), app(), { target })
    expect(code.match(/\.acmeSlot\(\)/g)).toHaveLength(1)
  })

  it('without the plugin the refs are ignored and the call stays verbatim', () => {
    const { code } = createCompiler().transform(app(), { target })
    expect(code).not.toContain('acmeSlot')
  })
})

describe('container seam shapes', () => {
  it('refModifiers must be an object with swift and/or kotlin functions', () => {
    expect(() => assertPluginShape({ name: '@acme/bad', apiVersion: 1, refModifiers: 1 })).toThrow('refModifiers must be an object')
    expect(() => assertPluginShape({ name: '@acme/bad', apiVersion: 1, refModifiers: {} })).toThrow('refModifiers must be an object')
    expect(() => assertPluginShape({ name: '@acme/ok', apiVersion: 1, refModifiers: { swift: () => undefined } })).not.toThrow()
  })
})
