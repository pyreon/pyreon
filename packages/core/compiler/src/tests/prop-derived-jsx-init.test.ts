/**
 * A prop-derived `const` whose initializer holds JSX ANYWHERE is never inlined
 * (#4300), on any path.
 *
 * Inlining splices the ORIGINAL source of the initializer into each use site,
 * so the JSX in it is re-emitted un-lowered: a plain `h()` reading props once
 * (`_mountSlot((<img alt={props.alt} />), …)`), a fresh element (and fresh
 * component state) per read. The const's own JSX already compiles with live
 * bindings, so referencing the const is both correct and live.
 *
 * Before the fix the two backends also disagreed under SSR: the JS backend
 * kept every JSX-bearing const (a deep walk), native kept only a directly-JSX
 * one (`<b/>`, `[<b/>]`, `.map(() => <b/>)`) and inlined `cond ? <b/> : <i/>`,
 * `cond && <b/>` and `() => <b/>`. Neither oracle covered a JSX-bearing
 * prop-derived initializer, so neither saw it.
 *
 * Oracle (independent of backend agreement): every initializer carries a
 * unique marker (`data-k="uN"`); the emitted program must contain it exactly
 * once — at the declaration — whatever the use site, and must parse.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (
  ...args: [
    code: string,
    filename: string,
    ssr: boolean,
    knownSignals: string[] | null,
    reactivityLens?: boolean,
    collapse?: unknown,
    ssrTemplate?: boolean,
  ]
) => { code: string }

let nativeTransform: NativeTransform | null = null

try {
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  nativeTransform = (
    requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as {
      transformJsx: NativeTransform
    }
  ).transformJsx
} catch {
  // native binary not built: the JS assertions still run
}

/** JSX-bearing initializers; `M` is replaced with the unique marker. */
const FORMS: Record<string, string> = {
  element: 'const X = <i class={props.c} M>e</i>',
  fragment: 'const X = <><b M>{props.x}</b></>',
  ternary: 'const X = props.f ? <b M>t</b> : <i>u</i>',
  logical: 'const X = props.f && <b M>{props.x}</b>',
  nullish: 'const X = props.slot ?? <b M>{props.x}</b>',
  'map of JSX': 'const X = props.items.map((x) => <li M>{x}</li>)',
  'array of JSX': 'const X = [<b M>{props.x}</b>, props.y]',
  'object holding JSX': 'const X = { icon: <b M>{props.x}</b>, label: props.l }',
  'call argument': 'const X = wrap(<b M>{props.x}</b>, props.y)',
  'function holding JSX': 'const X = () => <b M>{props.x}</b>',
  transitive: 'const A = <i title={props.t} M>a</i>; const X = props.f ? <p>{A}</p> : A',
}

/** Use sites; `X` is the const (called when it is a function). */
const USES: Record<string, string> = {
  child: '<div>{X}</div>',
  'child between siblings': '<div><b>s</b>{X}<i>t</i></div>',
  'component prop': '<C p={X} />',
  'component child': '<C>{X}</C>',
  'nested JSX in a ternary': '<div>{props.y ? <p>{X}</p> : null}</div>',
  '.map callback': '<ul>{props.list.map(() => X)}</ul>',
  'arrow prop': '<C render={() => X} />',
  'template literal': '<div title={`${X}`}>q</div>',
  spread: '<C {...{ x: X }} />',
  handler: '<button onClick={() => use(X)}>h</button>',
  'used twice': '<div>{X}<span>{X}</span></div>',
}

const MODES = [
  { name: 'client', ssr: false, ssrTemplate: false },
  { name: 'ssr', ssr: true, ssrTemplate: false },
  { name: 'ssrTemplate', ssr: true, ssrTemplate: true },
]

type Run = (src: string, m: (typeof MODES)[number]) => string

const BACKENDS: Array<[string, Run]> = [
  [
    'js',
    (src, m) => transformJSX_JS(src, 'c.tsx', { ssr: m.ssr, ssrTemplate: m.ssrTemplate }).code,
  ],
]

if (nativeTransform) {
  const nt = nativeTransform
  BACKENDS.push([
    'native',
    (src, m) => nt(src, 'c.tsx', m.ssr, null, false, undefined, m.ssrTemplate).code,
  ])
}

function source(form: string, use: string): string {
  const x = form === 'function holding JSX' ? 'X()' : 'X'

  return `export function W(props) {\n  ${FORMS[form]!.replace('M', 'data-k="u1"')}\n  return ${use.replace(/X/g, x)}\n}`
}

describe('a JSX-bearing prop-derived const is never inlined (#4300)', () => {
  for (const [backend, run] of BACKENDS) {
    for (const m of MODES) {
      for (const form of Object.keys(FORMS)) {
        for (const [useName, use] of Object.entries(USES)) {
          it(`${backend} · ${m.name} · ${form} · ${useName}`, () => {
            const out = run(source(form, use), m)
            expect(parseSync('o.tsx', out).errors, out).toEqual([])
            // the initializer's JSX exists once: at its declaration
            expect(out.split('u1').length - 1, out).toBe(1)
          })
        }
      }
    }
  }

  it('a non-JSX prop-derived const is still inlined (the reactivity feature)', () => {
    for (const [, run] of BACKENDS) {
      const out = run(
        'export function W(props) { const v = props.x + 1; return <C p={v} /> }',
        MODES[0]!,
      )
      expect(out).toContain('props.x + 1')
      expect(out).not.toContain('p={v}')
    }
  })
})

describe.skipIf(!nativeTransform)('native emit equals JS for every form, use and mode', () => {
  for (const m of MODES) {
    for (const form of Object.keys(FORMS)) {
      for (const [useName, use] of Object.entries(USES)) {
        it(`${m.name} · ${form} · ${useName}`, () => {
          const src = source(form, use)
          expect(BACKENDS[1]![1](src, m)).toBe(BACKENDS[0]![1](src, m))
        })
      }
    }
  }
})
