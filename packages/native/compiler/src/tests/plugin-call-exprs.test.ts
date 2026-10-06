import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import { assertPluginShape } from '../plugin-shape'
import { testNativePlugin } from '../testing'

// `CompilerPlugin.callExprs`: a CALL recognized by a callee the plugin recorded when it scanned the file, which no
// registry can key by name (`import { ping as p }` makes the callee whatever the file called it). Exercised through a
// toy "ping" plugin that is not a toast or an announcer, so the seam keeps a user that is neither.

const HEAD = `import { Button, Stack } from '@pyreon/primitives'
`

const NAMES = '@acme/ping:names'

const pingPlugin = (over: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/ping',
  apiVersion: 1,
  modules: ['@acme/ping'],
  scanModule(scan) {
    const names = scan.fileState<Set<string>>(NAMES, () => new Set())
    for (const node of scan.body as readonly { type: string; source?: { value?: string }; specifiers?: { imported?: { name?: string }; local?: { name?: string } }[] }[]) {
      if (node.type !== 'ImportDeclaration' || node.source?.value !== '@acme/ping') continue
      for (const spec of node.specifiers ?? []) if (spec.imported?.name === 'ping' && spec.local?.name) names.add(spec.local.name)
    }
  },
  callExprs(site, ctx) {
    const names = ctx.fileState<Set<string>>(NAMES, () => new Set())
    if (names.size === 0) return undefined
    const callee = site.callee as { type: string; name?: string; object?: { name?: string }; property?: { name?: string } }
    if (callee.type === 'Identifier' && names.has(callee.name!)) {
      return { type: 'ping', payload: { loud: false }, args: [ctx.expr(site.args[0]!)] }
    }
    if (callee.type === 'MemberExpression' && names.has(callee.object?.name ?? '')) {
      if (callee.property?.name === 'loud') return { type: 'ping', payload: { loud: true }, args: [ctx.expr(site.args[0]!)] }
      return ctx.unsupported(site.node, `\`${callee.object?.name}.${callee.property?.name}(…)\``, 'only `loud` lowers.')
    }
    return undefined
  },
  exprs: {
    ping: {
      swift: (e, ctx) => `AcmePing.send(${ctx.expr(e.args[0]!)}, loud: ${(e.payload as { loud: boolean }).loud})`,
      kotlin: (e, ctx) => `AcmePing.send(${ctx.expr(e.args[0]!)}, ${(e.payload as { loud: boolean }).loud})`,
    },
  },
  ...over,
})

const app = (body: string) => `import { ping as p } from '@acme/ping'
${HEAD}export function App() {
  return <Stack><Button onPress={() => { ${body} }}>go</Button></Stack>
}`

describe.each(['swift', 'kotlin'] as const)('callExprs (%s)', (target) => {
  const at = (text: string) => (target === 'swift' ? text : text.replace(', loud: ', ', '))

  it('a call on the recorded local name becomes the plugin ext-expr, with its argument emitted through ctx.expr', () => {
    const { code, warnings } = testNativePlugin(pingPlugin(), app(`p('a' + 'b')`), { target })
    expect(code).toContain(at(`AcmePing.send(`))
    expect(code).toContain(at(`, loud: false)`))
    expect(warnings).toEqual([])
  })

  it('a member call on the recorded name reaches the same recognizer; an unsupported member is reported and dropped', () => {
    const loud = testNativePlugin(pingPlugin(), app(`p.loud('x')`), { target })
    expect(loud.code).toContain(at(`, loud: true)`))
    const bogus = testNativePlugin(pingPlugin(), app(`p.quiet('x')`), { target })
    expect(bogus.code).not.toContain('AcmePing')
    expect(bogus.warnings.some((w) => w.includes('`p.quiet(…)` is not supported in native (PMTC) — only `loud` lowers.'))).toBe(true)
  })

  it('a file that never imported the binding is untouched: the recognizer declines and the call is the ordinary one', () => {
    const { code } = testNativePlugin(
      pingPlugin(),
      `${HEAD}export function App() {
  return <Stack><Button onPress={() => { p('x') }}>go</Button></Stack>
}`,
      { target },
    )
    expect(code).not.toContain('AcmePing')
  })

  it('a decline falls through to the next plugin, and with no plugin loaded the call is verbatim', () => {
    const second: CompilerPlugin = {
      name: '@acme/ping-b',
      apiVersion: 1,
      callExprs: () => ({ type: 'pingB' }),
      exprs: { pingB: { swift: () => 'B.swift()', kotlin: () => 'B.kotlin()' } },
    }
    const declining = pingPlugin({ callExprs: () => undefined })
    const source = app(`p('x')`)
    const result = createCompiler({ plugins: [declining, second] }).transform(source, { target })
    expect(result.code).toContain(target === 'swift' ? 'B.swift()' : 'B.kotlin()')
    expect(createCompiler().transform(source, { target }).code).toContain("p(\"x\")")
  })
})

describe('callExprs shape', () => {
  it('must be a synchronous function, and an ext-expr type needs an emitter', () => {
    expect(() => assertPluginShape({ name: '@acme/bad', apiVersion: 1, callExprs: 1 })).toThrow('callExprs must be a synchronous function')
    const noEmitter = pingPlugin({ exprs: {} })
    expect(() => createCompiler({ plugins: [noEmitter] }).transform(app(`p('x')`), { target: 'swift' })).toThrow('declares no `exprs.ping` emitter')
  })
})
