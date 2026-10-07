import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin } from '../index'

// `DeclEmitter.typing.member` types the PROPERTY read `<binding>.<property>` on a plugin declaration's container (the native
// shape), as `typing.callRead` types the zero-argument call. A member the declaration says may be absent comes back as a
// nullable union — which is what makes both emitters wrap its interpolation (`(g.level).map { … }`) instead of printing `Optional(…)`.
const toy = (withMember: boolean): CompilerPlugin => ({
  name: '@acme/gizmo',
  apiVersion: 1,
  modules: ['@acme/gizmo'],
  calls: { useGizmo: () => ({ type: 'gizmo' }) },
  decls: {
    gizmo: {
      swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = Gizmo()`,
      kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { Gizmo() }`,
      ...(withMember
        ? {
            typing: {
              member: (_d: unknown, property: string) =>
                property === 'level' ? { kind: 'union' as const, branches: [{ kind: 'number' as const }, { kind: 'null' as const }] } : undefined,
            },
          }
        : {}),
    },
  },
})

const SRC = `import { useGizmo } from '@acme/gizmo'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const g = useGizmo()
  return <Stack><Text>{g.level}</Text><Text>{g.name}</Text></Stack>
}`

describe('typing.member', () => {
  it('types a property read on the container, so an optional member is wrapped and an untyped one is not', () => {
    const swift = createCompiler({ plugins: [toy(true)] }).transform(SRC, { target: 'swift' }).code
    expect(swift).toContain('(g.level).map {')
    expect(swift).not.toContain('(g.name).map {')
    const kotlin = createCompiler({ plugins: [toy(true)] }).transform(SRC, { target: 'kotlin' }).code
    expect(kotlin).toMatch(/g\.level[^\n]*(?:let|\?)/)
  })

  it('without a typing the read is not typed at all', () => {
    expect(createCompiler({ plugins: [toy(false)] }).transform(SRC, { target: 'swift' }).code).not.toContain('(g.level).map {')
  })
})
