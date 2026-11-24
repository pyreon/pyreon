/**
 * An accessor the emit wraps around an expression that BUILDS JSX is walked in
 * place, not sliced — in both backends, client and SSR.
 *
 * Sliced, the JSX inside never got the rules every other JSX element gets: in
 * `<Comp>{rows().map((row) => <li key={row.id}>{row.label()}</li>)}</Comp>` the
 * `{row.label()}` read stayed eager, ran in the LIST's accessor, and the keyed
 * reconciler kept the row for the unchanged key, so the cell never updated.
 * The runtime half (rows update in place, hydration) is
 * `runtime-dom/src/tests/keyed-map-row-reactivity.test.tsx`.
 *
 * The walked JSX stays on the h() path (no `_tpl`, no `_ssr`): a component
 * receiving these children keeps receiving vnodes.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (code: string, filename: string, ssr: boolean, knownSignals: string[] | null) => {
  code: string
}

let nativeTransform: NativeTransform | null = null

try {
  // A napi `.node` addon cannot be loaded through `await import()`.
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  nativeTransform = (
    requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as { transformJsx: NativeTransform }
  ).transformJsx
} catch {
  // Native not built — the Rust half is skipped; native-equivalence reports it.
}

const js = (code: string, ssr: boolean): string => transformJSX_JS(code, 'c.tsx', { ssr }).code
const rust = (code: string, ssr: boolean): string | null => nativeTransform?.(code, 'c.tsx', ssr, null).code ?? null

const CASES: { name: string; src: string; contains: string[]; absent?: string[] }[] = [
  {
    name: 'keyed .map as a component child',
    src: 'function App() { return <Comp>{rows().map((row) => <li key={row.id} class={row.cls()}>{row.label()}</li>)}</Comp> }',
    contains: ['{() => (rows().map((row) => <li key={row.id} class={() => row.cls()}>{() => row.label()}</li>))}'],
    absent: ['_tpl(', '_ssr('],
  },
  {
    name: 'component rows get _rp props',
    src: 'function App() { return <Comp>{rows().map((row) => <Row key={row.id} label={row.label()} />)}</Comp> }',
    contains: ['label={_rp(() => row.label())}'],
  },
  {
    name: 'a component prop holding the list',
    src: 'function App() { return <List items={rows().map((row) => <li key={row.id}>{row.label()}</li>)} /> }',
    contains: ['items={_rp(() => (rows().map((row) => <li key={row.id}>{() => row.label()}</li>)))}'],
  },
  {
    name: 'a conditional under a component',
    src: 'function App() { return <Comp>{cond() ? <b>{x()}</b> : null}</Comp> }',
    contains: ['{() => (cond() ? <b>{() => x()}</b> : null)}'],
  },
  {
    name: 'a nested keyed .map inside a keyed row',
    src: 'function App() { return <Comp>{rows().map((row) => <li key={row.id}>{row.kids().map((k) => <b key={k.id}>{row.label()}</b>)}</li>)}</Comp> }',
    contains: ['{() => (row.kids().map((k) => <b key={k.id}>{() => row.label()}</b>))}'],
  },
  {
    name: 'an expression without JSX is still sliced as before',
    src: 'function App() { return <Comp>{count() + 1}</Comp> }',
    contains: ['{() => count() + 1}'],
  },
]

describe('wrapped JSX-building expressions are walked, not sliced', () => {
  for (const ssr of [false, true]) {
    const mode = ssr ? 'SSR' : 'client'
    it.each(CASES)(`JS ${mode}: $name`, ({ src, contains, absent }) => {
      const out = js(src, ssr)
      for (const c of contains) expect(out, out).toContain(c)
      for (const a of absent ?? []) expect(out, out).not.toContain(a)
    })

    it.each(CASES)(`Rust ${mode} emits the same: $name`, ({ src }) => {
      const out = rust(src, ssr)
      if (out === null) return
      expect(out).toBe(js(src, ssr))
    })
  }
})
