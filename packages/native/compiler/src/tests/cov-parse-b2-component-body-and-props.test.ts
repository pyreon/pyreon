// Branch coverage — `src/parse.ts` component-body statement lowering
// (`onMount` / `useHotkey` / `useInterval` / nested function declarations),
// the props-parameter parser, and the component-scope destructuring arms.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' })

const IMPORTS = `import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useHotkey } from '@pyreon/hotkeys'
import { useInterval, useTimeout, useFetch } from '@pyreon/hooks'
import { useParams, useLoaderData } from '@pyreon/router'
`
const body = (b: string) =>
  `${IMPORTS}export function App(){\n  const n = signal(0)\n${b}\n  return <Text>{String(n())}</Text>\n}`

describe('parse.ts — onMount lowers both callback body shapes', () => {
  it('lowers an ARROW with an expression body and a FunctionExpression identically', () => {
    const arrow = swift(body('  onMount(() => n.set(1))'))
    const fnExpr = swift(body('  onMount(function(){ n.set(1) })'))
    for (const r of [arrow, fnExpr]) {
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('.onAppear {')
      expect(r.code).toContain('n = 1')
    }
  })

  it('does NOT claim an onMount call with a non-function argument', () => {
    const r = swift(body('  const cb = () => n.set(1)\n  onMount(cb)'))
    expect(r.code).not.toContain('.onAppear {')
    expect(r.warnings.join('\n')).toContain('is not lowered natively and was DROPPED')
  })
})

describe('parse.ts — useHotkey argument validation', () => {
  it('lowers an arrow AND a FunctionExpression handler to the same key binding', () => {
    const arrow = swift(body("  useHotkey('mod+k', () => n.set(1))"))
    const fnExpr = swift(body("  useHotkey('mod+k', function(){ n.set(1) })"))
    for (const r of [arrow, fnExpr]) {
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('.keyboardShortcut(KeyEquivalent("k"), modifiers: [.command])')
    }
  })

  it('warns when the shortcut is not statically known', () => {
    const r = swift(body('  declare const k: string\n  useHotkey(k, () => n.set(1))'))
    expect(r.warnings.join('\n')).toContain('useHotkey() needs a statically-known shortcut')
    expect(r.code).not.toContain('.keyboardShortcut(')
  })

  it('warns when the handler is a reference rather than an inline function', () => {
    const r = swift(body("  const h = () => n.set(1)\n  useHotkey('mod+k', h)"))
    expect(r.warnings.join('\n')).toContain("useHotkey('mod+k', …) needs an inline handler function")
  })

  it('warns when the combo itself is unparseable', () => {
    const r = swift(body("  useHotkey('nope+zz', () => n.set(1))"))
    expect(r.warnings.join('\n')).toContain("useHotkey('nope+zz') — two base keys")
  })

  it('warns when the handler declares a KeyboardEvent parameter', () => {
    const r = swift(body("  useHotkey('mod+k', (e) => n.set(1))"))
    expect(r.warnings.join('\n')).toContain('handler takes a KeyboardEvent parameter')
    expect(r.code).not.toContain('.keyboardShortcut(')
  })

  it('lowers a BLOCK-bodied handler as well as an expression-bodied one', () => {
    const block = swift(body("  useHotkey('mod+k', () => { n.set(1) })"))
    const expr = swift(body("  useHotkey('mod+k', () => n.set(1))"))
    expect(block.code).toBe(expr.code)
  })
})

describe('parse.ts — useInterval / useTimeout argument validation', () => {
  it('lowers an arrow AND a FunctionExpression callback', () => {
    const arrow = swift(body('  useInterval(() => n.set(1), 100)'))
    const fnExpr = swift(body('  useInterval(function(){ n.set(1) }, 100)'))
    expect(arrow.warnings).toEqual([])
    expect(fnExpr.code).toBe(arrow.code)
  })

  it('lowers a BLOCK-bodied callback identically to an expression-bodied one', () => {
    const block = swift(body('  useTimeout(() => { n.set(1) }, 10)'))
    const expr = swift(body('  useTimeout(() => n.set(1), 10)'))
    expect(block.code).toBe(expr.code)
  })

  it('warns when the callback is a reference', () => {
    const r = swift(body('  const cb = () => n.set(1)\n  useInterval(cb, 100)'))
    expect(r.warnings.join('\n')).toContain('useInterval() needs an inline callback to lower natively')
  })

  it('warns when the delay is not a numeric literal', () => {
    const r = swift(body('  useInterval(() => n.set(1), n())'))
    expect(r.warnings.join('\n')).toContain('useInterval() needs a literal millisecond delay')
  })
})

describe('parse.ts — a nested function declaration in a component body', () => {
  it('emits a private func so later call sites resolve it', () => {
    const r = swift(body('  function del(){ n.set(0) }\n  useTimeout(() => del(), 10)'))
    expect(r.code).toContain('private func del()')
    expect(r.code).toContain('del()')
  })

  it('emits a void-bodied nested function too', () => {
    const r = swift(body('  function noop(x: number) { }'))
    expect(r.code).toContain('private func noop(_ x: Int)')
  })
})

describe('parse.ts — returnContainsJsx / helper-vs-component classification', () => {
  const APP = `\nexport function App(){ return <Text>x</Text> }\n`

  it('emits a camelCase non-JSX function as a native helper func', () => {
    const r = swift(`export function dbl(x: number): number { return x*2 }` + APP)
    expect(r.code).toContain('func dbl(_ x: Int) -> Int { x * 2 }')
  })

  it('warns + skips a GENERIC camelCase helper rather than mis-emitting `<T>`', () => {
    const r = swift(`export function first<T>(xs: T[]): T { return xs[0] }` + APP)
    expect(r.warnings.join('\n')).toContain('first looks like a GENERIC helper function')
    expect(r.code).not.toContain('func first')
  })

  it('treats a PARENTHESIZED JSX return as a component, not a helper', () => {
    const r = swift(`export function row(x: number) { return (<Text>{String(x)}</Text>) }` + APP)
    expect(r.code).toContain('struct row: View {')
    expect(r.code).not.toContain('func row(')
  })

  it('treats a TERNARY and a LOGICAL JSX return as a component too', () => {
    const tern = swift(`export function row(x: number) { return x > 1 ? <Text>a</Text> : null }` + APP)
    expect(tern.code).not.toContain('func row(')
    const logi = swift(`export function row(x: number) { return x > 1 && <Text>a</Text> }` + APP)
    expect(logi.code).not.toContain('func row(')
  })

  it('warns when a camelCase function returns NOTHING (no return statement)', () => {
    const r = swift(`export function noop(x: number) { }` + APP)
    expect(r.warnings.join('\n')).toContain('Component noop: no return statement found; skipping.')
  })
})

describe('parse.ts — parseProps', () => {
  it('enumerates props from a SIMPLE destructured parameter', () => {
    const r = swift(`export function Row({ label }: { label: string }) { return <Text>{label}</Text> }`)
    expect(r.code).toContain('let label: String')
  })

  it('bails (no props) on a RENAMED destructure — never a half-binding', () => {
    const r = swift(`export function Row({ label: lbl }: { label: string }) { return <Text>{lbl}</Text> }`)
    expect(r.code).not.toContain('let label: String')
    expect(r.code).not.toContain('let lbl: String')
  })

  it('bails on an EMPTY destructure pattern and on a REST element', () => {
    const empty = swift(`export function Row({ }: { label: string }) { return <Text>x</Text> }`)
    expect(empty.code).not.toContain('let label: String')
    const rest = swift(`export function Row({ ...rest }: { label: string }) { return <Text>x</Text> }`)
    expect(rest.code).not.toContain('let label: String')
  })

  it('bails on a destructured parameter with NO type annotation', () => {
    const r = swift(`export function Row({ label }) { return <Text>{label}</Text> }`)
    expect(r.code).not.toContain('let label: String')
  })

  it('bails on a non-Identifier, non-ObjectPattern first parameter', () => {
    const r = swift(`export function Row([a]: [string]) { return <Text>x</Text> }`)
    expect(r.code).not.toContain('let a:')
  })
})

describe('parse.ts — resolvePropsObjectType', () => {
  it('resolves a locally-declared object alias', () => {
    const r = swift(`type Foo = { x: string }\nexport function Row(p: Foo) { return <Text>{p.x}</Text> }`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let x: String')
  })

  it('warns on a typeRef it cannot resolve in this file', () => {
    const r = swift(`export function Row(p: Foo) { return <Text>{p.x}</Text> }`)
    expect(r.warnings.join('\n')).toContain('Component props type `Foo` can’t be resolved'.replace('’', "'"))
  })

  it('does NOT warn on a locally-declared string-literal-union (native enum) prop type', () => {
    const r = swift(`type Mode = 'a' | 'b'\nexport function Row(p: { m: Mode }) { return <Text>{p.m}</Text> }`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('enum Mode')
    expect(r.code).toContain('let m: Mode')
  })
})

describe('parse.ts — warnIfUntypedPropsParam', () => {
  it('warns when the body reads `props.X` through an untyped parameter', () => {
    const r = swift(`export function Row(props) { return <Text>{props.x}</Text> }`)
    expect(r.warnings.join('\n')).toContain('Component Row has an untyped `props` parameter')
  })

  it('reaches the same member through a TS cast layer', () => {
    const r = swift(`export function Row(props) { return <Text>{(props as any).x}</Text> }`)
    expect(r.warnings.join('\n')).toContain('Component Row has an untyped `props` parameter')
  })

  it('stays SILENT when an untyped parameter is never member-read', () => {
    const r = swift(`export function Row(props) { return <Text>hi</Text> }`)
    expect(r.warnings.join('\n')).not.toContain('untyped `props` parameter')
  })

  it('stays silent for an ANNOTATED parameter and for a component with no parameters', () => {
    expect(swift(`export function Row(props: { x: string }) { return <Text>{props.x}</Text> }`).warnings).toEqual([])
    expect(swift(`export function Row() { return <Text>hi</Text> }`).warnings).toEqual([])
  })
})

describe('parse.ts — component-scope destructuring', () => {
  it('lowers an all-simple container-hook destructure through a synthesized binding', () => {
    const r = swift(body(`  const { data, isPending } = useFetch<string>('https://x/y')`))
    expect(r.code).toContain('__pyHook0')
    expect(r.warnings.join('\n')).not.toContain('destructure form')
  })

  it('warns on a REST element, a NESTED pattern and an EMPTY container-hook destructure', () => {
    const msg = 'useFetch() destructure form'
    expect(swift(body(`  const { data, ...rest } = useFetch('https://x/y')`)).warnings.join('\n')).toContain(msg)
    expect(swift(body(`  const { data: { q } } = useFetch('https://x/y')`)).warnings.join('\n')).toContain(msg)
    expect(swift(body(`  const { } = useFetch('https://x/y')`)).warnings.join('\n')).toContain(msg)
  })

  it('lowers a useParams destructure, plain and renamed', () => {
    expect(swift(body('  const { id } = useParams()')).code).toContain(
      'private var id: String { useParams(router: pyreonRouter)["id"] ?? "" }',
    )
    expect(swift(body('  const { id: theId } = useParams()')).code).toContain(
      'private var theId: String { useParams(router: pyreonRouter)["id"] ?? "" }',
    )
  })

  it('declines a useParams destructure with no usable Property entries', () => {
    const spread = swift(body('  const { ...r } = useParams()'))
    expect(spread.code).not.toContain('useParams(router: pyreonRouter)')
    // A template-literal computed key yields no static key name, so the
    // entry is skipped and the whole destructure declines.
    const tmpl = swift(body('  declare const k: string\n  const { [`a${k}`]: v } = useParams()'))
    expect(tmpl.code).not.toContain('useParams(router: pyreonRouter)')
  })

  it('falls back to the KEY as the local name when the destructured value is not an Identifier', () => {
    const r = swift(body('  const { id: { q } } = useParams()'))
    expect(r.code).toContain('private var id: String { useParams(router: pyreonRouter)["id"] ?? "" }')
  })

  it('separates the useLoaderData identifier / destructure / other-shape diagnostics', () => {
    expect(swift(body('  const d = useLoaderData<{ x: string }>()')).warnings.join('\n')).toContain(
      '`const d = useLoaderData<T>()`',
    )
    expect(swift(body('  const { x } = useLoaderData<{ x: string }>()')).warnings.join('\n')).toContain(
      '`const { ... } = useLoaderData<T>()`',
    )
    expect(swift(body('  const [a] = useLoaderData<{ x: string }>()')).warnings.join('\n')).toContain(
      'useLoaderData<T>() declared (`useLoaderData<T>()`)',
    )
  })

  it('lowers a GENERAL object and array destructure through a __pyDestr container', () => {
    const obj = swift(body('  const o = signal({ a: 1, b: 2 })\n  const { a, b } = o()'))
    expect(obj.code).toContain('__pyDestr0')
    expect(obj.warnings).toEqual([])
    const arr = swift(body('  const xs = signal([1,2])\n  const [a, b] = xs()'))
    expect(arr.code).toContain('__pyDestr0')
    expect(arr.warnings).toEqual([])
  })

  it('warns LOUDLY for an array pattern with a hole, a rest, or no elements', () => {
    const msg = 'Component-body destructuring in this shape is not lowered to native'
    expect(swift(body('  const xs = signal([1,2])\n  const [, b] = xs()')).warnings.join('\n')).toContain(msg)
    expect(swift(body('  const xs = signal([1,2])\n  const [a, ...r] = xs()')).warnings.join('\n')).toContain(msg)
    expect(swift(body('  const xs = signal([1,2])\n  const [] = xs()')).warnings.join('\n')).toContain(msg)
  })
})
