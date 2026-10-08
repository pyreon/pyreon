import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import type { ComponentIR, ExprIR } from '../types'

function aliasCompiler(alias: ExprIR = { kind: 'literal', value: 21 }) {
  let components: ComponentIR[] = []
  const plugin: CompilerPlugin = {
    name: '@acme/alias', apiVersion: 1,
    declCalls: (site) => {
      const callee = site.callee as { type: string; name?: string }
      return callee.type === 'Identifier' && callee.name === 'createAlias' ? { alias } : undefined
    },
    prepareIR(module) { components = module.components },
  }
  return { compiler: createCompiler({ discovered: [plugin] }), components: () => components }
}

const SOURCE = `import { createAlias } from '@acme/alias'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const local = createAlias()
  const read = (): number => local
  const shadow = (local: number): number => local + 1
  const block = (): number => { const local = 9; return local }
  const nested = (): number => [1, 2].map((local: number) => local + 1)[0]
  const iteration = (): number => { let result = 0; for (const local of [1, 2]) { result += local }; return result }
  const counting = (): number => { let result = 0; for (let local = 0; local < 2; local++) { result += local }; return result }
  return <Stack><Text>{read()}</Text><Text>{shadow(2)}</Text><Text>{block()}</Text><Text>{nested()}</Text><Text>{local}</Text></Stack>
}
export function Other() {
  const local = 7
  return <Text>{local}</Text>
}`

describe('plugin declaration aliases', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`substitutes the alias without emitting a binding and respects lexical scopes on ${target}`, () => {
      const { compiler, components } = aliasCompiler()
      compiler.transform(SOURCE, { target })
      const app = components().find((component) => component.name === 'App')!
      const functions = app.decls.filter((decl) => decl.kind === 'function')
      expect(app.decls.some((decl) => 'name' in decl && decl.name === 'local')).toBe(false)
      expect(functions.find((decl) => decl.name === 'read')?.body).toEqual([{ kind: 'return', expr: { kind: 'literal', value: 21 } }])
      expect(functions.find((decl) => decl.name === 'shadow')?.body).toMatchObject([{ kind: 'return', expr: { kind: 'binary', left: { kind: 'identifier', name: 'local' } } }])
      expect(functions.find((decl) => decl.name === 'block')?.body).toMatchObject([{ kind: 'let', name: 'local' }, { kind: 'return', expr: { kind: 'identifier', name: 'local' } }])
      const nested = JSON.stringify(functions.find((decl) => decl.name === 'nested')?.body)
      expect(nested).toContain('"name":"local"')
      expect(nested).not.toContain('"value":21')
      for (const name of ['iteration', 'counting']) {
        const loop = JSON.stringify(functions.find((decl) => decl.name === name)?.body)
        expect(loop).toContain('"name":"local"')
        expect(loop).not.toContain('"value":21')
      }
      expect(components().find((component) => component.name === 'Other')?.decls).toMatchObject([{ kind: 'value', name: 'local', expr: { kind: 'literal', value: 7 } }])
      expect(compiler.transform(SOURCE, { target }).code).toBe(compiler.transform(SOURCE, { target }).code)
    })
  }

  it('rejects non-cloneable alias payloads with the owning plugin named', () => {
    const cyclic = { kind: 'literal', value: 1 } as unknown as Record<string, unknown>
    cyclic.cycle = cyclic
    const { compiler } = aliasCompiler(cyclic as unknown as ExprIR)
    expect(() => compiler.transform(SOURCE, { target: 'swift' })).toThrow(/alias.*cloneable/)
  })
})


describe('file-scanned alias factories', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`registers before components and keeps aliases local on ${target}`, () => {
      let components: ComponentIR[] = []
      const compiler = createCompiler({ discovered: [{
        name: '@acme/factory', apiVersion: 1,
        scanModule(scan) {
          scan.aliasFactory('useExample', { kind: 'literal', value: 23 }, 'Use an identifier binding for useExample')
          scan.skipTopLevel(node => (node as { type: string }).type === 'EmptyStatement')
        },
        prepareIR(module) { components = module.components },
      }] })
      const result = compiler.transform(`import { Text } from '@pyreon/primitives'
        export function App() { const example = useExample(); const read = (): number => example; return <Text>{read()}</Text> }
        export function Other() { const example = 7; return <Text>{example}</Text> }
        export function Destructure() { const { value } = useExample(); return <Text>Ready</Text> }
        ;`, { target })
      expect(components[0]?.decls).toMatchObject([{ kind: 'function', name: 'read', body: [{ kind: 'return', expr: { kind: 'literal', value: 23 } }] }])
      expect(components[1]?.decls).toMatchObject([{ kind: 'value', name: 'example', expr: { kind: 'literal', value: 7 } }])
      expect(result.warnings).toContain('Use an identifier binding for useExample')
      expect(result.code).not.toContain('useExample(')
    })
  }
  it('names the owning scanner when a factory expression is cyclic', () => {
    const alias = { kind: 'literal', value: 1 } as unknown as Record<string, unknown>
    alias.cycle = alias
    const compiler = createCompiler({ discovered: [{ name: '@acme/factory', apiVersion: 1,
      scanModule(scan) { scan.aliasFactory('useExample', alias as unknown as ExprIR) },
    }] })
    expect(() => compiler.transform('export function App() { return <Text>Ready</Text> }', { target: 'swift' })).toThrow(/factory.*scanModule.*cloneable/)
  })
})
