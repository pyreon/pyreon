import { describe, expect, it } from 'vitest'
import { assertPluginShape } from '../plugin-shape'
import { createCompiler, type CompilerPlugin, type SignalPersistence } from '../index'

// A recognizer may return a plain SIGNAL (`{ signal }`) instead of a declaration of its own, and one plugin may supply
// the persistence primitive a persisted one is declared with. A toy library (not storage) proves both are
// library-agnostic: the core owns reads, writes, type inference and the sibling analysis; the plugin owns the call names
// and the primitive.
const persistence: SignalPersistence = {
  swift: (site, ctx) => `@Kept(${ctx.stringLiteral(site.key)}) private var ${ctx.ident(site.name)}: ${site.type} = ${site.initial} /* native=${site.nativeType} */`,
  kotlin: (site, ctx) =>
    site.nativeType
      ? { wrapper: 'rememberKept' }
      : { line: `var ${ctx.ident(site.name)} by rememberKeptJson<${site.type}>(${ctx.stringLiteral(site.key)}, ${site.emptyList ? 'listOf()' : site.initial}) // list=${site.emptyList}` },
}

const toy = (extra: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/toy',
  apiVersion: 1,
  modules: ['@acme/toy'],
  calls: {
    useKept: (_call, ctx) => {
      const key = ctx.staticString(ctx.args[0])
      return key === null ? null : { signal: { initial: ctx.args[1], persistKey: key } }
    },
    useFleeting: (_call, ctx) => ({ signal: { initial: ctx.args[0] } }),
  },
  decls: {},
  persistence,
  ...extra,
})

const SRC = `import { useKept, useFleeting } from '@acme/toy'
import { Stack, Text, Button } from '@pyreon/primitives'
type Row = { id: number }
export function App() {
  const n = useKept<number>('n', 1)
  const rows = useKept<Row[]>('rows', [])
  const maybe = useKept<string | null>('maybe', null)
  const gone = useFleeting<number>(5)
  const inferred = useFleeting('abc')
  const missing = useFleeting<number>()
  return (<Stack><Text>{n()} {rows().length} {maybe()} {gone()} {inferred()} {missing()}</Text><Button onPress={() => n.set(n() + 1)}>go</Button></Stack>)
}`

const compile = (target: 'swift' | 'kotlin', plugin = toy()) => createCompiler({ plugins: [plugin] }).transform(SRC, { target }).code

describe('a recognizer that returns a signal', () => {
  it('is a core signal: plain state, typed from the generic or the initial literal, default initial 0', () => {
    const swift = compile('swift')
    expect(swift).toContain('@State private var gone: Int = 5')
    expect(swift).toContain('@State private var inferred: String = "abc"')
    expect(swift).toContain('@State private var missing: Int = 0')
    expect(swift).toContain('Button("go") { n = n + 1 }')
    const kotlin = compile('kotlin')
    expect(kotlin).toContain('var gone by remember { mutableStateOf(5L) }')
    expect(kotlin).toContain('var missing by remember { mutableStateOf(0L) }')
  })
})

describe('CompilerPlugin.persistence', () => {
  it('renders a persisted signal on SwiftUI, telling the backend whether the platform persists the type itself', () => {
    const swift = compile('swift')
    expect(swift).toContain('@Kept("n") private var n: Int = 1 /* native=true */')
    expect(swift).toContain('@Kept("rows") private var rows: [Row] = [] /* native=false */')
    expect(swift).toContain('@Kept("maybe") private var maybe: String? = nil /* native=true */')
  })

  it('renders a persisted signal on Compose: a wrapper keeps the core line, a line replaces it', () => {
    const kotlin = compile('kotlin')
    expect(kotlin).toContain('var n by rememberKept { mutableStateOf(1L) }')
    expect(kotlin).toContain('var rows by rememberKeptJson<List<Row>>("rows", listOf()) // list=true')
    expect(kotlin).toContain('var maybe by rememberKept { mutableStateOf<String?>(null) }')
  })

  it('a persisted signal with no backend loaded names its key', () => {
    expect(() => compile('swift', toy({ persistence: undefined }))).toThrow(/persists under the key "n" but no loaded plugin declares `persistence`/)
  })

  it('two backends are a load-time error naming both owners', () => {
    expect(() => createCompiler({ plugins: [toy(), toy({ name: '@acme/other', modules: ['@acme/other'], calls: {} })] })).toThrow(
      /signal persistence is declared by both "@acme\/toy" and "@acme\/other"/,
    )
  })

  it('rejects a backend without both targets', () => {
    expect(() => assertPluginShape({ name: '@acme/bad', apiVersion: 1, persistence: { swift: () => '' } })).toThrow(/persistence needs swift and kotlin functions/)
  })
})
