/**
 * A REACTIVE number reaches the DOM unconverted, on every reactive text sink,
 * and the binding's "did it change" check compares raw values.
 *
 * JS-side Number→String (`String(n)`, `n + ''`, a template literal) of more
 * than ~200 distinct integers makes V8 grow its Number→String cache
 * (`smi_string_cache`, held from the GC roots) to ~64 KB that the page never
 * gets back; the DOM's own conversion does not touch it. #4780 fixed the
 * static sinks. The reactive ones (`_bindText` both tiers, `_bindProp`,
 * `bindPolymorphicText` and its lazy text phase, the h() accessor child) still
 * ran `String(v)` on every update and compared strings, so a counter or a
 * price cell grew the cache all the same. The heap itself is only observable
 * in Chromium with a heap snapshot (see the PR); this file locks the cause:
 * what each DOM text API receives is a `number`.
 *
 * It also locks what the string compare used to give for free: a value whose
 * TEXT does not change is not rewritten (`1` → `'1'`, `NaN` → `NaN`, `0` →
 * `-0`), and hydration adopts server text that equals the browser's own
 * conversion of the number without a write or a report, while a real mismatch
 * is still reported and corrected.
 *
 * Every compiled shape goes through the REAL `transformJSX` (client and SSR).
 */
import { transformJSX } from '@pyreon/compiler'
import { _fuse, _rp, _slot, Fragment, h } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _bindProp, _bindText, _setChild, _tpl, hydrateRoot, mount, onHydrationMismatch } from '../index'
import { bindPolymorphicText } from '../mount'

const s = signal<unknown>(0)
const DEPS = { _tpl, _bind, renderEffect, _bindText, _bindProp, _setChild, bindPolymorphicText, _fuse, _rp, _slot, h, Fragment, signal, s }

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function build(src: string, ssr = false): { App: () => unknown; code: string } {
  const { code } = transformJSX(src, 'case.tsx', ssr ? { ssr: true } : {})
  for (const m of code.matchAll(/^import\s*\{([^}]*)\}/gm)) {
    for (const name of (m[1] ?? '').split(',').map((x) => x.trim().split(/\s+as\s+/).pop()!)) {
      if (name && !(name in DEPS)) throw new Error(`[harness] emit imports "${name}"; add it to DEPS`)
    }
  }
  const fn = new Function(...Object.keys(DEPS), `${lower(code)}\nreturn App`)

  return { App: fn(...Object.values(DEPS)) as () => unknown, code }
}

/** Reactive render shapes, named by the sink the client compile lowers them to. */
const SHAPES: { name: string; src: string; sink: RegExp | null }[] = [
  { name: '_bindText (direct tier)', src: 'const App = () => <span>{s()}</span>', sink: /_bindText\(s,/ },
  {
    name: '_bindText (tracked tier)',
    src: 'const read = () => s()\nconst App = () => <span>{read()}</span>',
    sink: /_bindText\(read,/,
  },
  {
    name: 'bindPolymorphicText',
    src: 'const read = (_k) => s()\nconst App = () => <span>{read(1)}</span>',
    sink: /bindPolymorphicText\(/,
  },
  {
    name: '_bindProp (signal getter)',
    src: 'const Cell = (props) => <span>{props.n}</span>\nconst App = () => <Cell n={s()} />',
    sink: /_bindProp\(props, "n"/,
  },
  {
    name: '_bindProp (computed getter)',
    src: 'const read = (_k) => s()\nconst Cell = (props) => <span>{props.n}</span>\nconst App = () => <Cell n={read(1)} />',
    sink: /_bindProp\(props, "n"/,
  },
  { name: 'h() accessor', src: 'const App = () => h("span", null, () => s())', sink: null },
]

const VALUES: { v: unknown; text: string }[] = [
  { v: 4242, text: '4242' },
  { v: 0, text: '0' },
  { v: -0, text: '0' },
  { v: Number.NaN, text: 'NaN' },
  { v: Number.POSITIVE_INFINITY, text: 'Infinity' },
  { v: -7, text: '-7' },
  { v: 2 ** 53, text: '9007199254740992' },
  { v: 1.5, text: '1.5' },
  { v: 1e21, text: '1e+21' },
  { v: 1e-7, text: '1e-7' },
  { v: BigInt(10), text: '10' },
  { v: 'abc', text: 'abc' },
  { v: '', text: '' },
  { v: null, text: '' },
  { v: undefined, text: '' },
  { v: true, text: '' },
  { v: false, text: '' },
  { v: ['a', 1, 'b'], text: 'a1b' },
  { v: { toString: () => 'T' }, text: 'T' },
]

// Every DOM text entry point, recording the type of what it was handed.
type Seen = { api: string; type: string }
let seen: Seen[] = []
const restore: (() => void)[] = []

function spyMethod(proto: object, name: string, api: string): void {
  const orig = (proto as Record<string, (...a: unknown[]) => unknown>)[name]!
  const own = Object.prototype.hasOwnProperty.call(proto, name)
  ;(proto as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
    for (const a of args) if (typeof a !== 'object' || a === null) seen.push({ api, type: typeof a })
    return orig.apply(this, args)
  }
  restore.push(() => {
    if (own) (proto as Record<string, unknown>)[name] = orig
    else delete (proto as Record<string, unknown>)[name]
  })
}

function spySetter(proto: object, name: string, api: string): void {
  const d = Object.getOwnPropertyDescriptor(proto, name)
  if (d?.set === undefined) return
  const set = d.set
  Object.defineProperty(proto, name, {
    ...d,
    set(this: Node, v: unknown) {
      // Writes into the page only: a detached node (the DOM conversion's
      // scratch node in `text-value.ts`) is not a text write.
      if (this.isConnected) seen.push({ api, type: typeof v })
      set.call(this, v)
    },
  })
  restore.push(() => Object.defineProperty(proto, name, d))
}

const hosts: HTMLElement[] = []
// Every mount subscribes to the shared signal `s`; unmounted after each test.
const unmounts: (() => void)[] = []
const track = (u: unknown) => {
  unmounts.push(u as () => void)
}
function host(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  hosts.push(el)

  return el
}

beforeEach(() => {
  s.set(0)
  seen = []
  spyMethod(document, 'createTextNode', 'createTextNode')
  spySetter(CharacterData.prototype, 'data', 'data')
  spySetter(CharacterData.prototype, 'nodeValue', 'nodeValue')
  spySetter(Node.prototype, 'nodeValue', 'nodeValue')
  spySetter(Node.prototype, 'textContent', 'textContent')
  spySetter(Element.prototype, 'textContent', 'textContent')
})

afterEach(() => {
  for (const u of unmounts.splice(0)) u()
  while (restore.length > 0) restore.pop()!()
  for (const el of hosts.splice(0)) el.remove()
})

describe('a reactive number reaches the DOM unconverted', () => {
  for (const shape of SHAPES) {
    describe(shape.name, () => {
      if (shape.sink !== null) {
        it('compiles to the sink under test', () => {
          expect(build(shape.src).code).toMatch(shape.sink!)
        })
      }

      it('every update renders the rule text; a number is handed over as a number', () => {
        const { App } = build(shape.src)
        const el = host()
        s.set(1)
        track(mount(h(App as never, null), el))
        expect(el.textContent).toBe('1')
        for (const { v, text } of VALUES) {
          seen = []
          s.set(v)
          expect(el.textContent).toBe(text)
          if (typeof v === 'number') {
            // `-0` after `0` leaves the text alone: no write at all.
            if (seen.length > 0) expect(seen).toEqual([{ api: 'data', type: 'number' }])
          }
        }
      })

      it('20,000 distinct numbers: every write is a number', () => {
        const { App } = build(shape.src)
        const el = host()
        track(mount(h(App as never, null), el))
        seen = []
        for (let i = 1; i <= 20_000; i++) s.set(i)
        expect(el.textContent).toBe('20000')
        expect(seen.length).toBe(20_000)
        expect(seen.every((x) => x.api === 'data' && x.type === 'number')).toBe(true)
      })

      it('a value whose text does not change is not rewritten', () => {
        const { App } = build(shape.src)
        const el = host()
        s.set(1)
        track(mount(h(App as never, null), el))
        seen = []
        s.set('1') // number → string, same text
        s.set(1) // and back
        expect(seen).toEqual([])
        s.set(Number.NaN)
        expect(seen.length).toBe(1)
        s.set(Number.NaN) // the signal dedupes; nothing re-runs
        s.set(0)
        s.set(-0) // the signal notifies (Object.is), the text is the same
        expect(el.textContent).toBe('0')
        expect(seen.length).toBe(2)
      })
    })
  }
})

describe('SSR → hydrate with a number', () => {
  for (const shape of SHAPES) {
    describe(shape.name, () => {
      for (const v of [4242, 0, -0, Number.NaN, 1.5, 1e21, -7]) {
        it(`${Object.is(v, -0) ? '-0' : String(v)}: adopted without a write or a report`, async () => {
          s.set(v)
          const html = await renderToString(h(build(shape.src, true).App as never, null) as never)
          const el = host()
          el.innerHTML = html
          const serverText = el.querySelector('span')!.firstChild
          const reports: string[] = []
          const off = onHydrationMismatch((ctx) => reports.push(`${ctx.type}: ${ctx.expected} vs ${ctx.actual}`))
          seen = []
          try {
            track(hydrateRoot(el, h(build(shape.src).App as never, null)))
          } finally {
            off()
          }
          expect(reports).toEqual([])
          expect(seen.filter((x) => x.api !== 'createTextNode')).toEqual([])
          expect(el.querySelector('span')!.firstChild).toBe(serverText)
          // Later updates compare raw values and still write numbers.
          seen = []
          s.set(77)
          expect(el.textContent).toBe('77')
          expect(seen).toEqual([{ api: 'data', type: 'number' }])
        })
      }

      it('a real mismatch is reported and corrected', async () => {
        s.set(5)
        const html = await renderToString(h(build(shape.src, true).App as never, null) as never)
        const el = host()
        el.innerHTML = html
        s.set(6)
        const reports: string[] = []
        const off = onHydrationMismatch((ctx) => reports.push(`${ctx.type}: ${ctx.expected} vs ${ctx.actual}`))
        try {
          track(hydrateRoot(el, h(build(shape.src).App as never, null)))
        } finally {
          off()
        }
        expect(el.textContent).toBe('6')
        expect(reports).toEqual(['text: 6 vs 5'])
      })
    })
  }
})
