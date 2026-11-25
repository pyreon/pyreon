/**
 * The three native-backend divergences the real-file gate
 * (`real-files-equivalence.test.ts`) found on main, as minimal shapes. In each
 * the JS backend follows the documented rule and the native one did not:
 *
 * 1. `new X()` is a fixed value: dynamic only when its callee or an argument
 *    is. Native treated every `new` as dynamic, so `client={new QueryClient()}`
 *    became `_rp(() => new QueryClient())` and every props read built a new
 *    client.
 * 2. A function whose first parameter is registered as props is one with JSX
 *    ANYWHERE in it (the JS `checkJSX` walk visits every child). Native matched
 *    a few statement/expression shapes, so `return p.items.map((i) => <li
 *    title={p.x}/>)` never registered `p`, and `title={p.x}` was a one-time read.
 * 3. A template becomes `_lc(() => …)` only as the SOLE child of a component
 *    (its direct parent). Native let an expression-position fragment inherit
 *    the outer component's flags, so `<For>{(r) => (<><dt/><dd/></>)}</For>` as
 *    a component's sole child wrapped each cell in `_lc`.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (
  ...args: [string, string, boolean, string[] | null, boolean, undefined, boolean, boolean]
) => { code: string }

let nativeTransform: NativeTransform | null = null

try {
  const here = dirname(fileURLToPath(import.meta.url))
  nativeTransform = (
    createRequire(import.meta.url)(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as {
      transformJsx: NativeTransform
    }
  ).transformJsx
} catch {
  // The JS contract still runs; native parity runs when the addon is built.
}

const SHAPES: Record<string, { src: string; has: string[]; not?: string[] }> = {
  '`new X()` as a component prop is not a reactive prop': {
    src: 'function A() { return <P client={new Q({ a: { b: 1 } })}><App /></P> }',
    has: ['client={new Q({ a: { b: 1 } })}'],
    not: ['_rp('],
  },
  '`new X(signal())` is dynamic through its argument': {
    src: 'import { signal } from "@pyreon/reactivity"\nconst n = signal(0)\nfunction A() { return <P v={new Q(n())} /> }',
    has: ['v={_rp(() => new Q(n()))}'],
  },
  'JSX inside a `.map` callback registers the component props': {
    src: 'function List(p) { return p.items.map((i) => <li title={p.x}>{i}</li>) }',
    has: ['renderEffect(() => { _setAttr(__root, "title", p.x) })'],
  },
  'JSX inside an object-literal method registers the props': {
    src: 'function f(meta) { return { r: () => <b>{`x ${meta.t}`}</b> } }',
    has: ['bindPolymorphicText(() => (`x ${meta.t}`)'],
  },
  'a fragment row under a sole-child `<For>` gets no `_lc`': {
    src: 'function A(props) { return <DefList><For each={props.rows} by={(r) => r.t}>{(r) => (<><dt>{r.t}</dt><dd>{r.x}</dd></>)}</For></DefList> }',
    has: ['(<>{_tpl("<dt></dt>"'],
    not: ['_lc('],
  },
}

const MODES = [
  { name: 'client', ssr: false, ssrTemplate: false, tcc: false },
  { name: 'client + tcc', ssr: false, ssrTemplate: false, tcc: true },
  { name: 'ssr', ssr: true, ssrTemplate: false, tcc: false },
  { name: 'ssrTemplate', ssr: true, ssrTemplate: true, tcc: false },
] as const

describe('the documented rule (JS backend, client)', () => {
  for (const [name, { src, has, not = [] }] of Object.entries(SHAPES)) {
    it(name, () => {
      const out = transformJSX_JS(src, 'shape.tsx').code
      for (const h of has) expect(out).toContain(h)
      for (const n of not) expect(out).not.toContain(n)
    })
  }
})

describe.runIf(nativeTransform !== null)('native is byte-identical on every mode', () => {
  for (const [name, { src }] of Object.entries(SHAPES)) {
    it(name, () => {
      for (const m of MODES) {
        const js = transformJSX_JS(src, 'shape.tsx', {
          ssr: m.ssr,
          ssrTemplate: m.ssrTemplate,
          templatizeComponentChildren: m.tcc,
        }).code
        const rs = nativeTransform!(src, 'shape.tsx', m.ssr, null, false, undefined, m.ssrTemplate, m.tcc).code
        expect(parseSync('shape.tsx', rs).errors, rs).toEqual([])
        expect(rs, m.name).toBe(js)
      }
    })
  }
})
