import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin } from '../index'

// `DeclEmitter.typing.methodReturn` types the RETURN of a method call on a plugin declaration's container (`secrets.read('k')`).
// A method whose runtime return is optional comes back as a nullable union, so a local seeded from it classifies for the
// optional-condition lowering: `if (token)` becomes a nil test, where a bare optional used as a condition does not compile on
// either target.
const toy = (withReturn: boolean): CompilerPlugin => ({
  name: '@acme/vault',
  apiVersion: 1,
  modules: ['@acme/vault'],
  calls: { useVault: () => ({ type: 'vault' }) },
  decls: {
    vault: {
      swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = Vault()`,
      kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { Vault() }`,
      ...(withReturn
        ? {
            typing: {
              methodReturn: (_d: unknown, method: string) =>
                method === 'read' ? { kind: 'union' as const, branches: [{ kind: 'string' as const }, { kind: 'null' as const }] } : undefined,
            },
          }
        : {}),
    },
  },
})

const SRC = `import { useVault } from '@acme/vault'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const v = useVault()
  const token = v.read('k')
  const other = v.peek('k')
  return <Stack><Text>{token ? 'in' : 'out'}</Text><Text>{other ? 'a' : 'b'}</Text></Stack>
}`

describe('typing.methodReturn', () => {
  it('types a method call on the container, so a condition on an optional return is a nil test (and an untyped one is not)', () => {
    const swift = createCompiler({ plugins: [toy(true)] }).transform(SRC, { target: 'swift' }).code
    expect(swift).toContain('token?.isEmpty == false')
    expect(swift).not.toContain('other != nil')
    const kotlin = createCompiler({ plugins: [toy(true)] }).transform(SRC, { target: 'kotlin' }).code
    expect(kotlin).toContain('token != null')
    expect(kotlin).not.toContain('other != null')
  })

  it('without a typing the return is not typed at all', () => {
    expect(createCompiler({ plugins: [toy(false)] }).transform(SRC, { target: 'swift' }).code).not.toContain('token?.isEmpty == false')
  })
})
