/**
 * TEXT FUSION — JS backend EMISSION lock.
 *
 * `<p>Hello {name}!</p>` lowers to ONE accessor child on every path:
 *   client   `_tpl("<p> </p>", … bindPolymorphicText(() => (_fuse("Hello ", name(), "!")), __t0, __root))`
 *   `_ssr`   `_ssr(["<p>", "</p>"], _escSole(_fuse("Hello ", name(), "!")))`
 *   h()      `<p>{() => _fuse("Hello ", name(), "!")}</p>`
 * so the element carries NO `<!--$-->` range markers on the server and
 * hydration adopts its single text node. The runtime half (adoption,
 * coercion, VNode parts) is locked in `@pyreon/runtime-dom`'s
 * `text-fusion.test.tsx`; native parity in `native-equivalence.test.ts`.
 * This file locks the codegen shape and, above all, the exact BOUNDARY of
 * what fuses — every "does not fuse" spec is a shape whose existing path
 * (direct tier, mid slot, mount slot, component children) must stay intact.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const client = (src: string) => transformJSX_JS(src, 'test.tsx').code
const ssrH = (src: string) => transformJSX_JS(src, 'test.tsx', { ssr: true }).code
const ssrT = (src: string) => transformJSX_JS(src, 'test.tsx', { ssr: true, ssrTemplate: true }).code
const SIG = `const name = signal('x'); const n = signal(1); `

describe('text fusion — emission shapes', () => {
  it('static text around an interpolation fuses on all three paths', () => {
    const src = SIG + `const v = <p>Hello {name}!</p>`
    const c = client(src)
    expect(c).toContain('_tpl("<p> </p>"')
    expect(c).toContain('const __t0 = __root.firstChild;')
    expect(c).toContain('bindPolymorphicText(() => (_fuse("Hello ", name(), "!")), __t0, __root)')
    expect(c).not.toContain('<!>')
    expect(c).toMatch(/import \{[^}]*_fuse[^}]*\} from "@pyreon\/core"/)
    expect(ssrT(src)).toContain('_ssr(["<p>", "</p>"], _escSole(_fuse("Hello ", name(), "!")))')
    expect(ssrT(src)).not.toContain('<!--$-->')
    expect(ssrH(src)).toContain('<p>{() => _fuse("Hello ", name(), "!")}</p>')
  })

  it('adjacent expressions and a trailing/leading text fuse', () => {
    expect(client(SIG + `const v = <p>{name}{n}</p>`)).toContain('_fuse(name(), n())')
    expect(client(SIG + `const v = <p>{n} items</p>`)).toContain('_fuse(n(), " items")')
    expect(client(SIG + `const v = <p>{name()}{n()}{name()}</p>`)).toContain('_fuse(name(), n(), name())')
  })

  it('literal expression children fold into the adjacent static part', () => {
    expect(client(SIG + `const v = <p>{"a"}{name} {"b"}{54}</p>`)).toContain('_fuse("a", name(), " b54")')
  })

  it('accessor-form parts are unwrapped; a prop read fuses live', () => {
    expect(client(SIG + `const v = <p>x {() => name()} y</p>`)).toContain('_fuse("x ", name(), " y")')
    expect(client(`function C(props){ return <p>Hello {props.name}!</p> }`)).toContain(
      '_fuse("Hello ", props.name, "!")',
    )
  })

  it('nested fused elements each get their own binding off the chained refs', () => {
    const c = client(`function C(props){ return <div><p>Hello {props.name}!</p><i>{props.n} items</i></div> }`)
    expect(c).toContain('_tpl("<div><p> </p><i> </i></div>"')
    expect(c).toContain('bindPolymorphicText(() => (_fuse("Hello ", props.name, "!")), __t1, __e0)')
    expect(c).toContain('bindPolymorphicText(() => (_fuse(props.n, " items")), __t3, __e2)')
  })

  it('static parts are quoted through the shared statics escaper', () => {
    expect(client(SIG + `const v = <p>a "q" \\ {name}</p>`)).toContain('_fuse("a \\"q\\" \\\\ ", name())')
  })
})

describe('text fusion — the boundary (what stays on its existing path)', () => {
  it('a lone signal call keeps the `_bindText` direct tier', () => {
    const c = client(SIG + `const v = <p>{name()}</p>`)
    expect(c).toContain('_bindText(name,')
    expect(c).not.toContain('_fuse(')
  })

  it('a lone prop read keeps `_bindProp`', () => {
    expect(client(`function C(props){ return <p>{props.x}</p> }`)).toContain('_bindProp(props, "x"')
  })

  it('a static-only mix keeps the baked placeholder shape', () => {
    const c = client(`const x = 1; const v = <p>Hello {x}!</p>`)
    expect(c).toContain('_setChildAt(')
    expect(c).not.toContain('_fuse(')
  })

  it('an element sibling keeps the run mixed', () => {
    const c = client(SIG + `const v = <p>Hello {name}!<i></i></p>`)
    expect(c).toContain('_textSlot(')
    expect(c).not.toContain('_fuse(')
    expect(ssrT(SIG + `const v = <p>Hello {name}!<i></i></p>`)).toContain('<!--$-->')
  })

  it('mount-slot shapes never fuse: children read, JSX helper call, inline JSX, element-valued const', () => {
    for (const src of [
      `function C(props){ return <p>a {props.children} b</p> }`,
      `const cell = (v) => <b>{v}</b>; ` + SIG + `const v = <p>a {cell(n())} b</p>`,
      SIG + `const v = <p>a {n() && <i/>} b</p>`,
      `const el = <b/>; ` + SIG + `const v = <p>{name} {el}</p>`,
    ]) {
      const c = client(src)
      expect(c, src).toContain('_mountSlot(')
      expect(c, src).not.toContain('_fuse(')
    }
  })

  it('a component parent never fuses — its children are its props', () => {
    const c = client(SIG + `const v = <Comp>Hello {name}!</Comp>`)
    expect(c).not.toContain('_fuse(')
    expect(c).toContain('<Comp>Hello {() => name()}!</Comp>')
  })

  it('a fragment or spread child disqualifies the element', () => {
    expect(client(SIG + `const v = <p>{name}<>!</></p>`)).not.toContain('_fuse(')
  })
})

describe('text fusion — reactivity lens', () => {
  it('records each fused part with its own verdict', () => {
    const src = `const x = 1; ` + SIG + `const v = <p>Hello {name}, {x}!</p>`
    const { reactivityLens } = transformJSX_JS(src, 'test.tsx', { reactivityLens: true })
    const kinds = (reactivityLens ?? []).map((s) => `${s.kind}:${src.slice(s.start, s.end)}`).sort()
    expect(kinds).toContain('reactive:name')
    expect(kinds).toContain('static-text:x')
  })
})
