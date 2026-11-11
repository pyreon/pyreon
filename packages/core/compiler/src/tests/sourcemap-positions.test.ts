/**
 * Source-map POSITIONS, on both backends (#4418).
 *
 * The native backend used to return no map at all, and `transformJSX` prefers
 * it, so Vite treated the compiled module as line-identical to the source:
 * every frame landed below the failing statement by the number of import and
 * hoisted-static lines the compiler put on top. A Plain Mode module also
 * mapped to its REWRITTEN text rather than the caller's.
 *
 * Each case decodes the returned map and asserts that a token in the output
 * traces back to that token's exact line AND column in the input.
 *
 * Bisect: drop `map_mappings` from the native result (or the
 * `wrapNativeMap` call in `transformJSX`) → the native rows fail with no map;
 * drop the plain composition in `mergePlain` → the plain rows fail on column.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { transformDeferInline } from '../defer-inline'
import { transformPlain } from '../plain'
import { composeMappings, composeMappingsJS } from '../source-map-compose'
import { transformJSX, transformJSX_JS, type TransformOptions, type TransformResult } from '../jsx'

let nativeLoaded = false
try {
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node'))
  nativeLoaded = true
} catch {
  // No local binary: `transformJSX` falls back to JS, and the native rows
  // below would only re-test the JS backend. They are skipped, loudly.
}

/** 1-based line, 0-based column of the first `needle` in `text`. */
function locate(text: string, needle: string): { line: number; column: number } {
  const at = text.indexOf(needle)
  if (at < 0) throw new Error(`needle ${JSON.stringify(needle)} not in:\n${text}`)
  const before = text.slice(0, at).split('\n')
  return { line: before.length, column: before[before.length - 1]!.length }
}

function expectMapsBack(input: string, result: TransformResult, needle: string) {
  expect(result.map, 'a transform that moved code must return a map').toBeDefined()
  const traced = originalPositionFor(
    new TraceMap(result.map as never),
    locate(result.code, needle),
  )
  expect({ line: traced.line, column: traced.column }, needle).toEqual(locate(input, needle))
}

// The statement the overlay points at sits BELOW everything the compiler
// adds on top: runtime imports, `@pyreon/core` imports, and a hoisted
// `const _$h0 = …` for the static subtree.
const SOURCE = `import { signal } from '@pyreon/reactivity'
const count = signal(0)

export function Panel(props: { on: boolean; label: string }) {
  const badge = <span class="badge">static</span>
  // Reads a browser global while the server renders the page.
  const width = window.innerWidth
  return (
    <div class={props.label} title="héllo 😀">
      {badge}{count()} {width}
      <p>{props.on ? 'on' : 'off'}</p>
    </div>
  )
}
function after(x: number) { return x ? 1 : missingThing.value }
`

const MODES: Array<[string, TransformOptions]> = [
  ['client', {}],
  ['ssr', { ssr: true }],
  ['ssr-template', { ssr: true, ssrTemplate: true }],
  ['client-tpl-components', { templatizeComponentChildren: true }],
]

const BACKENDS: Array<[string, typeof transformJSX, boolean]> = [
  ['JS', transformJSX_JS, true],
  ['native', transformJSX, nativeLoaded],
]

for (const [backend, transform, available] of BACKENDS) {
  describe.skipIf(!available)(`${backend} backend — positions map back to the source`, () => {
    for (const [mode, options] of MODES) {
      it(`${mode}: statements below injected imports and a hoisted static`, () => {
        const r = transform(SOURCE, '/app/src/panel.tsx', options)
        expect(r.code).not.toBe(SOURCE)
        // On the line after the hoisted `<span>` static, and after the
        // non-ASCII attribute (columns are UTF-16, as in a JS engine).
        expectMapsBack(SOURCE, r, 'window.innerWidth')
        expectMapsBack(SOURCE, r, 'missingThing.value')
        expectMapsBack(SOURCE, r, 'signal(0)')
      })
    }

    it('the issue #4418 reproduction maps to line 3', () => {
      const src = `export default function Viewport() {
  // Reads a browser global while the server renders the page.
  const width = window.innerWidth
  return <p>Viewport is {width}px wide</p>
}
`
      const r = transform(src, '/app/src/routes/v.tsx', { ssr: false })
      // Two import lines land on top of this module.
      expect(locate(r.code, 'window.innerWidth').line).toBe(5)
      expectMapsBack(src, r, 'window.innerWidth')
    })

    it('a Plain Mode module maps to the text the caller passed, not the rewrite', () => {
      const src = `'use plain'
import { state } from '@pyreon/core/plain'
export function Counter() {
  let count = state(0)
  const next = count + 1; const probe = missingThing.value
  return <button onClick={() => count++}>{count} {next}</button>
}
`
      const r = transform(src, '/app/src/counter.tsx')
      // The rewrite turns reads into calls (`count` → `count()`), which
      // moves every later column on that line.
      expectMapsBack(src, r, 'missingThing.value')
      expect(r.map!.sourcesContent?.[0]).toBe(src)
    })

    it('a Plain Mode module the JSX pass leaves alone still returns a map', () => {
      const src = `'use plain'
import { state } from '@pyreon/core/plain'
export const total = state(0); export const probe = () => missingThing.value
`
      const r = transform(src, '/app/src/store.ts')
      expect(r.code).not.toBe(src)
      expectMapsBack(src, r, 'missingThing.value')
    })
  })
}

describe.skipIf(!nativeLoaded)('native and JS composition agree', () => {
  it('composeMappings (native) equals the JS oracle on real pre-pass + JSX maps', () => {
    const plainSrc = (body: string) => `'use plain'
import { state, derived } from '@pyreon/core/plain'
${body}
`
    const sources = [
      plainSrc('export function C() {\n  let n = state(0)\n  const d = derived(n * 2); const x = missingThing.value\n  return <p onClick={() => n++}>{n} {d}</p>\n}'),
      plainSrc('export const total = state(0)\nexport const label = () => `é ${total} 😀`'),
      plainSrc(SOURCE.replace("import { signal } from '@pyreon/reactivity'\n", '')),
    ]
    for (const src of sources) {
      const plain = transformPlain(src, '/app/p.tsx')!
      const jsx = transformJSX_JS(plain.code, '/app/p.tsx')
      // A module with no JSX: compose the pre-pass map with itself instead.
      const outer = jsx.map?.mappings ?? plain.map!.mappings
      expect(composeMappings(outer, plain.map!.mappings)).toBe(composeMappingsJS(outer, plain.map!.mappings))
      if (!jsx.map) continue
      expect(composeMappings(jsx.map!.mappings, plain.map!.mappings)).toBe(
        composeMappingsJS(jsx.map!.mappings, plain.map!.mappings),
      )
    }
    // Degenerate inputs: empty, one line, trailing empty lines, 1-field segments.
    for (const [outer, inner] of [['', ''], ['AAAA', 'AAAA'], ['AAAA;;', 'AAAA;AACA'], ['A,CAAC', 'AAAA,EAAE']]) {
      expect(composeMappings(outer!, inner!)).toBe(composeMappingsJS(outer!, inner!))
    }
  })
})

describe.skipIf(!nativeLoaded)('native and JS maps are the same map', () => {
  it('field for field, for every mode', () => {
    for (const [, options] of MODES) {
      const js = transformJSX_JS(SOURCE, 'C:\\app\\panel.tsx', options)
      const rs = transformJSX(SOURCE, 'C:\\app\\panel.tsx', options)
      expect(rs.code).toBe(js.code)
      expect(JSON.parse(rs.map!.toString())).toEqual(JSON.parse(js.map!.toString()))
      expect(rs.map!.toUrl()).toBe(js.map!.toUrl())
    }
  })
})

describe('inline <Defer> rewrite', () => {
  const src = `import { Defer } from '@pyreon/core'
import { Modal } from './modal'
import { Other, Third } from './other'

export const X = () => <div><Defer when={open}><Modal /></Defer><Defer when={b}><Other /></Defer><Defer when={c}><Third /></Defer></div>
const probe = missingThing.value
`

  it('removes whole import lines and returns a map that accounts for them', () => {
    const r = transformDeferInline(src, '/app/x.tsx')
    expect(r.changed).toBe(true)
    expect(r.code).not.toContain("from './modal'")
    const traced = originalPositionFor(
      new TraceMap(r.map as never),
      locate(r.code, 'missingThing.value'),
    )
    expect({ line: traced.line, column: traced.column }).toEqual(locate(src, 'missingThing.value'))
  })

  it('dropping two bindings of one declaration leaves valid JavaScript', () => {
    // Each binding's removal edit used to be built alone; for adjacent
    // specifiers they overlapped and left `import {  from './other'`.
    const two = src.replace("import { Other, Third } from './other'", "import { Other, Third, Kept } from './other'")
    const r = transformDeferInline(`${two}\nKept()\n`, '/app/x.tsx')
    expect(r.code).toContain("import { Kept } from './other'")
    const all = transformDeferInline(src, '/app/x.tsx')
    expect(all.code).not.toContain("'./other'\n")
    expect(all.code).not.toMatch(/import \{\s*(,|\})/)
  })
})
