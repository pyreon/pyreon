import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin } from '../index'

// `DeclEmitter.typing.member` types the PROPERTY read `<binding>.<property>` on a plugin declaration's container (the native
// shape), as `typing.callRead` types the zero-argument call. A member the declaration says may be absent comes back as a
// nullable union, and one it types as a string reads bare. An UNTYPED read is routed through `pyreonOptionalText` too (it may be
// absent), so the typing is what lets a present member skip the wrapper.
const toy = (withMember: boolean): CompilerPlugin => ({
  name: '@acme/gizmo',
  apiVersion: 2,
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
                property === 'level'
                  ? { kind: 'union' as const, branches: [{ kind: 'number' as const }, { kind: 'null' as const }] }
                  : property === 'name'
                    ? { kind: 'string' as const }
                    : undefined,
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
  it('types a property read on the container: an optional member is wrapped, a present string one is not', () => {
    const swift = createCompiler({ plugins: [toy(true)] }).transform(SRC, { target: 'swift' }).code
    expect(swift).toContain('pyreonOptionalText(g.level, "")')
    expect(swift).toContain('Text(verbatim: "\\(g.name)")')
    const kotlin = createCompiler({ plugins: [toy(true)] }).transform(SRC, { target: 'kotlin' }).code
    expect(kotlin).toContain('${pyreonOptionalText(g.level, "")}')
    expect(kotlin).toContain('Text(text = "${g.name}")')
  })

  it('without a typing neither read is typed, so both take the absent-safe wrapper', () => {
    const swift = createCompiler({ plugins: [toy(false)] }).transform(SRC, { target: 'swift' }).code
    expect(swift).toContain('pyreonOptionalText(g.level, "")')
    expect(swift).toContain('pyreonOptionalText(g.name, "")')
  })
})
