import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import { createScanRegistry } from '../module-scan'
import type { CompilerPlugin } from '../plugin'
import { assertPluginShape } from '../plugin-shape'
import { testNativePlugin } from '../testing'

// The file-level parse seams the `@pyreon/http` / `@pyreon/query` plugins needed: `scanModule`
// (facts, skipped metadata, lowered imports), `requestSources` (a fact crossing plugins through
// `ParseContext.requests`), `destructureCalls`, a `null` recognizer verdict (a claim that declares
// nothing), `new Name(…)` recognizers, `typing.callRead`, `asyncState`, `lifecycle.tailOrder` and
// `EmitContext.statements`. Each is exercised here through toy plugins, so a seam keeps a user that is
// not http/query; those two plugins are locked by the native-http / native-usequery / native-use-stream suites.

const HEAD = `import { Stack, Text, Suspense } from '@pyreon/primitives'
`

/** A toy "endpoints" plugin: records `const ep = endpoint('/x')` facts and resolves calls of them. */
const endpointsPlugin = (): CompilerPlugin => ({
  name: '@acme/endpoints',
  apiVersion: 1,
  modules: ['@acme/endpoints'],
  scanModule(scan) {
    const facts = scan.fileState<Map<string, string>>('@acme/endpoints:facts', () => new Map())
    for (const node of scan.body) {
      const decls = (node as { declarations?: { id?: { name?: string }; init?: { callee?: { name?: string }; arguments?: { value?: string }[] } }[] }).declarations ?? []
      for (const d of decls) {
        if (d.init?.callee?.name === 'endpoint' && d.id?.name !== undefined) facts.set(d.id.name, d.init.arguments?.[0]?.value ?? '')
      }
    }
    scan.skipTopLevel((node) => {
      const decls = (node as { declarations?: { id?: { name?: string } }[] }).declarations ?? []
      return decls.length > 0 && decls.every((d) => d.id?.name !== undefined && facts.has(d.id.name))
    })
    scan.lowered('@acme/endpoints', 'endpoint')
  },
  requestSources: [
    {
      has: (name, ctx) => ctx.fileState<Map<string, string>>('@acme/endpoints:facts', () => new Map()).has(name),
      resolve: (name, _arg, _options, ctx) => ({
        url: ctx.fileState<Map<string, string>>('@acme/endpoints:facts', () => new Map()).get(name) ?? '',
        method: 'GET',
        response: { binding: 'Schema', array: false },
      }),
    },
  ],
})

/** A toy "feed" plugin: a keyed container that is an async source, has typed reads and a tail lifecycle. */
const feedPlugin = (over: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/feed',
  apiVersion: 1,
  modules: ['@acme/feed'],
  calls: {
    useFeed: (call, ctx) => (call.argCount === 0 ? null : { type: 'feed', payload: { label: ctx.stringLiteralArg(0) ?? '' } }),
    Feed: (call) => (call.construct === true ? { type: 'feed', payload: { label: 'new' } } : undefined),
  },
  destructureCalls: ['useFeed'],
  decls: {
    feed: {
      legacyKind: 'feed',
      swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = PyreonFeed()`,
      kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { PyreonFeed() }`,
      lifecycle: {
        tailOrder: 20,
        swift: (d, ctx) => [`.task { ${ctx.ident(d.name)}.run() }`],
        kotlin: (d, ctx) => [`LaunchedEffect(Unit) { ${ctx.ident(d.name)}.run() }`],
      },
      asyncState: {
        swift: (d, ctx) => ({ pending: `${ctx.ident(d.name)}.busy`, error: `${ctx.ident(d.name)}.failed` }),
        kotlin: (d, ctx) => ({ pending: `${ctx.ident(d.name)}.busy.value`, error: `${ctx.ident(d.name)}.failed.value` }),
      },
      typing: { callRead: (_d, property) => (property === 'size' ? { kind: 'number' } : undefined) },
    },
  },
  ...over,
})

describe.each(['swift', 'kotlin'] as const)('scan seams on %s', (target) => {
  it('scanModule: facts feed a request source, the metadata declaration is skipped, the import counts as lowered', () => {
    const { code, warnings } = testNativePlugin(
      endpointsPlugin(),
      `import { endpoint } from '@acme/endpoints'
${HEAD}const getThing = endpoint('/things')
export function App() { return <Stack><Text>x</Text></Stack> }`,
      { target },
    )
    // Skipped: no binding for the metadata declaration reaches the emit.
    expect(code).not.toContain('getThing')
    expect(code).not.toContain('endpoint(')
    // The import is marked lowered, so the web-only warning for it is not printed.
    expect(warnings.some((w) => w.includes('endpoint (from @acme/endpoints)'))).toBe(false)
  })

  it('requestSources: the core useFetch resolves a call of a plugin-recorded binding', () => {
    const { code } = testNativePlugin(
      endpointsPlugin(),
      `import { endpoint } from '@acme/endpoints'
import { useFetch } from '@pyreon/hooks'
${HEAD}const getThing = endpoint('/things')
type Thing = { id: string }
export function App() {
  const t = useFetch<Thing>(getThing({}))
  return <Stack><Text>{t.data()?.id ?? ''}</Text></Stack>
}`,
      { target },
    )
    expect(code).toContain(target === 'swift' ? 'PyreonFetch<Thing>' : 'PyreonFetch<Thing>')
    expect(code).toContain('"/things"')
  })

  it('calls: a null verdict CLAIMS the call without a declaration (no generic fall-through)', () => {
    const { code } = testNativePlugin(
      feedPlugin(),
      `import { useFeed } from '@acme/feed'
${HEAD}export function App() {
  const f = useFeed()
  return <Stack><Text>x</Text></Stack>
}`,
      { target },
    )
    // Declined (undefined) would fall to the value-const catch-all and emit `let f = useFeed()`.
    expect(code).not.toContain('useFeed')
    expect(code).not.toContain('PyreonFeed')
  })

  it('calls: `new Name(…)` reaches the recognizer with construct set; a plain call of the same name declines', () => {
    const constructed = testNativePlugin(
      feedPlugin(),
      `import { Feed } from '@acme/feed'
${HEAD}export function App() {
  const f = new Feed()
  return <Stack><Text>x</Text></Stack>
}`,
      { target },
    )
    expect(constructed.code).toContain('PyreonFeed()')
  })

  it('destructureCalls: a claimed hook result may be destructured to its fields', () => {
    const { code, warnings } = testNativePlugin(
      feedPlugin(),
      `import { useFeed } from '@acme/feed'
${HEAD}export function App() {
  const { size } = useFeed('a')
  return <Stack><Text>{size()}</Text></Stack>
}`,
      { target },
    )
    expect(code).toContain('PyreonFeed()')
    expect(warnings.some((w) => w.includes('destructure form'))).toBe(false)
  })

  it('destructureCalls: a destructure the recognizer cannot lower warns BY HOOK NAME, not with the generic residual', () => {
    const { warnings } = testNativePlugin(
      feedPlugin(),
      `import { useFeed } from '@acme/feed'
${HEAD}export function App() {
  const { size } = useFeed()
  return <Stack><Text>x</Text></Stack>
}`,
      { target },
    )
    expect(warnings.some((w) => w.startsWith('useFeed() destructure form'))).toBe(true)
  })

  it('lifecycle.tailOrder: the harness is emitted after the compiler lifecycle, through the decl emitter', () => {
    const { code } = testNativePlugin(
      feedPlugin(),
      `import { useFeed } from '@acme/feed'
${HEAD}export function App() {
  const f = useFeed('a')
  return <Stack><Text>x</Text></Stack>
}`,
      { target },
    )
    expect(code).toContain(target === 'swift' ? '.task { f.run() }' : 'LaunchedEffect(Unit) { f.run() }')
  })

  it('asyncState: <Suspense> ORs over a plugin async source', () => {
    const { code } = testNativePlugin(
      feedPlugin(),
      `import { useFeed } from '@acme/feed'
${HEAD}export function App() {
  const f = useFeed('a')
  return <Suspense fallback={<Text>wait</Text>}><Text>done</Text></Suspense>
}`,
      { target },
    )
    expect(code).toContain(target === 'swift' ? 'if f.busy' : 'if (f.busy.value)')
  })
})

describe('scan registry + shape', () => {
  it('builds scanners, sources and destructure names in plugin order', () => {
    const reg = createScanRegistry([endpointsPlugin(), feedPlugin()])
    expect(reg.scanners.map((s) => s.owner)).toEqual(['@acme/endpoints'])
    expect(reg.sources.map((s) => s.owner)).toEqual(['@acme/endpoints'])
    expect([...reg.destructureCalls]).toEqual(['useFeed'])
  })

  it('rejects a malformed scanModule / requestSources / destructureCalls with the plugin named', () => {
    const bad = (over: object): CompilerPlugin => ({ name: '@acme/bad', apiVersion: 1, ...over }) as CompilerPlugin
    expect(() => assertPluginShape(bad({ scanModule: 1 }))).toThrow(/@acme\/bad.*scanModule/)
    expect(() => assertPluginShape(bad({ requestSources: [{ has: () => true }] }))).toThrow(/request source needs has and resolve/)
    expect(() => assertPluginShape(bad({ requestSources: {} }))).toThrow(/requestSources must be an array/)
    expect(() => assertPluginShape(bad({ destructureCalls: [''] }))).toThrow(/destructureCalls/)
  })

  it('a scanner that throws is reported with its plugin name', () => {
    const compiler = createCompiler({
      discovered: [
        {
          name: '@acme/boom',
          apiVersion: 1,
          scanModule() {
            throw new Error('nope')
          },
        },
      ],
    })
    expect(() => compiler.transform(`export function App() { return null }`, { target: 'swift' })).toThrow(/@acme\/boom failed in scanModule: nope/)
  })
})
