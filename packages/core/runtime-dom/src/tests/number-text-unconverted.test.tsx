/**
 * A static NUMBER child reaches the DOM unconverted, on every static text sink.
 *
 * JS-side Number→String (`String(n)`, `n + ''`, a template literal) of more
 * than ~200 distinct integers makes V8 grow its Number→String cache
 * (`smi_string_cache`, held from the GC roots) to its full size: ~64 KB that
 * the page never gets back. The DOM's own conversion (WebIDL `DOMString`, i.e.
 * ECMAScript `ToString`: the same characters) does not touch that cache.
 *
 * #4560 routed `_setChild` / `_setChildAt` through `_childText`, which calls
 * `String(n)`, so a `<For>` of rows rendering `{row.id}` grew the cache and the
 * row board's retained heap went up by 64 KB (3.13 → 3.19 MB, bisected to
 * a4a2ebc7f). The heap itself is only observable in Chromium with
 * `--enable-precise-memory-info`; what this file locks is the cause: the value
 * each DOM API receives is still a `number`, and the text is the rule's.
 *
 * Every compiled shape goes through the REAL `transformJSX`.
 */
import { transformJSX } from '@pyreon/compiler'
import { h } from '@pyreon/core'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _bindProp, _setChild, _setChildAt, _tpl, mount } from '../index'

const DEPS = { _tpl, _setChild, _setChildAt, _bindProp, h }

function build(src: string, get: () => unknown): () => unknown {
  const { code } = transformJSX(src, 'case.tsx')
  const js = transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const fn = new Function(...Object.keys(DEPS), 'get', `${js}\nreturn App`)

  return fn(...Object.values(DEPS), get) as () => unknown
}

// Every DOM entry point a text write can take, recording what it was handed.
type Seen = { api: string; type: string }
let seen: Seen[] = []
const restore: (() => void)[] = []

function spyMethod(proto: object, name: string, api: string): void {
  const orig = (proto as Record<string, (...a: unknown[]) => unknown>)[name]!
  const own = Object.prototype.hasOwnProperty.call(proto, name)
  ;(proto as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
    for (const a of args) if (typeof a === 'number' || typeof a === 'string') seen.push({ api, type: typeof a })
    return orig.apply(this, args)
  }
  restore.push(() => {
    if (own) (proto as Record<string, unknown>)[name] = orig
    else delete (proto as Record<string, unknown>)[name]
  })
}

function spySetter(proto: object, name: string, api: string): void {
  // happy-dom defines `textContent` on Element.prototype as well as on
  // Node.prototype; a browser only on Node.prototype.
  const d = Object.getOwnPropertyDescriptor(proto, name)
  if (d?.set === undefined) return
  Object.defineProperty(proto, name, {
    ...d,
    set(this: unknown, v: unknown) {
      seen.push({ api, type: typeof v })
      d.set!.call(this, v)
    },
  })
  restore.push(() => Object.defineProperty(proto, name, d))
}

beforeEach(() => {
  seen = []
  spyMethod(document, 'createTextNode', 'createTextNode')
  spyMethod(Element.prototype, 'replaceChildren', 'replaceChildren')
  spyMethod(Element.prototype, 'append', 'append')
  spySetter(CharacterData.prototype, 'data', 'data')
  spySetter(Node.prototype, 'textContent', 'textContent')
  spySetter(Element.prototype, 'textContent', 'textContent')
})

afterEach(() => {
  while (restore.length > 0) restore.pop()!()
  document.body.innerHTML = ''
})

const SHAPES: { name: string; src: string; sink: RegExp | null }[] = [
  { name: '_setChild', src: 'const App = () => { const v = get(); return <span>{v}</span> }', sink: /_setChild\(__root, v\)/ },
  {
    name: '_setChildAt',
    src: 'const App = () => { const v = get(); return <span><i />{v}<i /></span> }',
    sink: /_setChildAt\(/,
  },
  {
    name: '_bindProp (data property)',
    src: 'const Cell = (props) => <span>{props.n}</span>\nconst App = () => h(Cell, { n: get() })',
    sink: /_bindProp\(props, "n"/,
  },
  { name: 'h() sole child', src: 'const App = () => h("span", null, get())', sink: null },
  { name: 'h() among siblings', src: 'const App = () => h("span", null, h("i", null), get())', sink: null },
]

const VALUES: { v: number; text: string }[] = [
  { v: 4242, text: '4242' },
  { v: 0, text: '0' },
  { v: -0, text: '0' },
  { v: Number.NaN, text: 'NaN' },
  { v: 1.5, text: '1.5' },
  { v: 1e21, text: '1e+21' },
]

describe('a static number child reaches the DOM unconverted', () => {
  for (const shape of SHAPES) {
    describe(shape.name, () => {
      if (shape.sink !== null) {
        it('compiles to the sink under test', () => {
          expect(transformJSX(shape.src, 'case.tsx').code).toMatch(shape.sink!)
        })
      }
      for (const { v, text } of VALUES) {
        it(`${String(v)} → "${text}", handed to the DOM as a number`, () => {
          const App = build(shape.src, () => v)
          const host = document.createElement('div')
          document.body.appendChild(host)
          seen = []
          mount(h(App as never, null), host)
          const span = host.querySelector('span')!
          expect(span.textContent).toBe(text)
          // The DOM received the value itself, never a JS-side string of it.
          const writes = seen.filter((s) => s.type === 'number')
          expect(writes.length).toBeGreaterThan(0)
          expect(seen.filter((s) => s.type === 'string' && s.api !== 'createTextNode')).toEqual([])
        })
      }
    })
  }
})
