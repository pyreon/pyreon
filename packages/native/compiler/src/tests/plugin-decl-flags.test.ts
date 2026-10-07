import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin } from '../index'

// `DeclEmitter.callable` and `DeclEmitter.usesRouter` are library-agnostic: a toy declaration (not url-state) proves the
// compiler reads the flags from the emitter, not from a library name.
const toy = (flags: { callable?: boolean; usesRouter?: boolean }): CompilerPlugin => ({
  name: '@acme/toy',
  apiVersion: 1,
  modules: ['@acme/toy'],
  calls: { useToy: () => ({ type: 'toy' }) },
  decls: {
    toy: {
      ...flags,
      swift: (d, ctx) => `private var ${ctx.ident(d.name)}: Toy { Toy() }`,
      kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = Toy()`,
    },
  },
})

const SRC = `import { useToy } from '@acme/toy'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const t = useToy()
  return (<Stack><Text>{t()}</Text></Stack>)
}`

const swift = (flags: Parameters<typeof toy>[0]) => createCompiler({ plugins: [toy(flags)] }).transform(SRC, { target: 'swift' }).code
const kotlin = (flags: Parameters<typeof toy>[0]) => createCompiler({ plugins: [toy(flags)] }).transform(SRC, { target: 'kotlin' }).code

describe('DeclEmitter.callable', () => {
  it('keeps the parentheses of a zero-argument call of the binding on both targets', () => {
    expect(swift({ callable: true })).toContain('"\\(t())"')
    expect(kotlin({ callable: true })).toContain('${t()}')
  })

  it('without it an unknown identifier reads as a property, as before', () => {
    expect(swift({})).toContain('"\\(t)"')
    expect(kotlin({})).toContain('${t}')
  })
})

describe('DeclEmitter.usesRouter', () => {
  it('injects the router environment into the SwiftUI View', () => {
    expect(swift({ usesRouter: true })).toContain('@Environment(\\.pyreonRouter) private var pyreonRouter')
  })

  it('does nothing without it', () => {
    expect(swift({})).not.toContain('pyreonRouter')
  })
})
