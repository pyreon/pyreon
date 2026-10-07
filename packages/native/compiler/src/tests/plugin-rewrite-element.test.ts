import { describe, expect, it } from 'vitest'
import { assertPluginShape } from '../plugin-shape'
import { createCompiler, type CompilerPlugin } from '../index'

// `CompilerPlugin.rewriteElement` rewrites a JSX element whose tag names a LOCAL binding the plugin recorded when it scanned
// the file, and may ask the component for declarations (`requestComponentDecls`). A toy "tinted box" (not kinetic) proves
// both are library-agnostic.
let asked = 0
const toy: CompilerPlugin = {
  name: '@acme/tint',
  apiVersion: 1,
  modules: ['@acme/tint'],
  scanModule: (scan) => {
    const tags = scan.fileState('@acme/tint:tags', () => new Set<string>())
    for (const node of scan.body as readonly { type: string; declarations?: { id?: { name?: string }; init?: { callee?: { name?: string } } }[] }[]) {
      for (const d of node.declarations ?? []) if (d.init?.callee?.name === 'tint' && d.id?.name) tags.add(d.id.name)
    }
    scan.skipTopLevel((node) => (node as { declarations?: { id?: { name?: string } }[] }).declarations?.every((d) => tags.has(d.id?.name ?? '')) === true)
  },
  rewriteElement: (el, ctx) => {
    if (!ctx.fileState('@acme/tint:tags', () => new Set<string>()).has(el.tag)) return undefined
    // Every box of the component asks, with a different name each time: the FIRST request is the one applied.
    const name = `tinted${asked++}`
    ctx.requestComponentDecls('tint', {
      head: [{ kind: 'signal', name, type: { kind: 'boolean' }, initial: { kind: 'literal', value: false } }],
      tail: [{ kind: 'on-mount', body: [{ kind: 'assign', target: { kind: 'identifier', name }, op: '=', value: { kind: 'literal', value: true } }] }],
    })
    return { kind: 'jsx-element', tag: 'Stack', attrs: [{ kind: 'attr', name: 'data-tint', value: { kind: 'literal', value: 'on' } }, ...el.attrs], children: el.children }
  },
}

const SRC = `import { tint } from '@acme/tint'
import { Stack, Text } from '@pyreon/primitives'
const Warm = tint('div')
export function Both() { return (<Stack><Warm><Text>a</Text></Warm><Warm><Text>b</Text></Warm></Stack>) }
export function Neither() { return (<Stack><Text>c</Text></Stack>) }`

const compile = (target: 'swift' | 'kotlin') => {
  asked = 0
  return createCompiler({ plugins: [toy] }).transform(SRC, { target }).code
}

describe('CompilerPlugin.rewriteElement', () => {
  it('replaces the tag of a locally bound element and drops the binding the scan skipped', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const code = compile(target)
      expect(code, target).not.toContain('Warm')
      expect(code, target).toContain(target === 'swift' ? 'VStack' : 'Column')
    }
  })

  it('applies a component-decl request once per key however many elements ask, to the component that asked only', () => {
    const swift = compile('swift')
    expect(swift.match(/@State private var tinted0: Bool = false/g)).toHaveLength(1)
    expect(swift).not.toContain('tinted1')
    const neither = swift.slice(swift.indexOf('struct Neither'))
    expect(neither).not.toContain('tinted')
    const kotlin = compile('kotlin')
    expect(kotlin.match(/var tinted0 by remember \{ mutableStateOf\(false\) \}/g)).toHaveLength(1)
    expect(kotlin.match(/tinted0 = true/g)).toHaveLength(1)
    expect(kotlin).not.toContain('tinted1')
  })

  it('without the plugin the tag is left alone', () => {
    expect(createCompiler().transform(SRC, { target: 'swift' }).code).toContain('Warm')
  })

  it('rejects a rewrite that is not a function', () => {
    expect(() => assertPluginShape({ name: '@acme/bad', apiVersion: 1, rewriteElement: 'x' })).toThrow(/rewriteElement must be a synchronous function/)
  })
})
