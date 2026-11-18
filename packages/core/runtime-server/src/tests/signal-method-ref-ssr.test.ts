/**
 * Server side of #4356: a signal method handed to a component as a callback
 * prop (`onPick={choice.set}`) is bound by the compiler in SSR mode too, so a
 * component that calls it during setup writes the signal it came from. Both
 * backends, plain SSR and the `ssrTemplate` emit.
 */
import * as compiler from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { h } from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { describe, expect, test } from 'vitest'
import * as server from '../index'
import { renderToString } from '../index'

const MODULES: Record<string, Record<string, unknown>> = {
  '@pyreon/core': core as unknown as Record<string, unknown>,
  '@pyreon/reactivity': reactivity as unknown as Record<string, unknown>,
  '@pyreon/runtime-server': server as unknown as Record<string, unknown>,
}

function linkImports(code: string): { names: string[]; values: unknown[]; body: string } {
  const names: string[] = []
  const values: unknown[] = []
  const body = code.replace(
    /^\s*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?\s*$/gm,
    (_m, list: string, src: string) => {
      const mod = MODULES[src]
      if (!mod) throw new Error(`unexpected import from ${src}`)
      for (const raw of list.split(',')) {
        const name = raw.trim()
        if (!name || names.includes(name)) continue
        names.push(name)
        values.push(mod[name])
      }

      return ''
    },
  )

  return { names, values, body }
}

/** Calls its callback props during setup, as a server-rendered child may. */
function Picker(props: {
  onPick: (v: string) => void
  onBump: (f: (n: number) => number) => void
}) {
  props.onPick('picked')
  props.onBump((n) => n + 10)

  return h('i', null, 'p')
}

const SOURCE = `import { signal } from '@pyreon/reactivity'
export function App() {
  const choice = signal('')
  const n = signal(1)
  return <div><Picker onPick={choice.set} onBump={n?.update} /><b>{() => choice() + ':' + n()}</b></div>
}`

const CASES = [
  [
    'js',
    (o: { ssrTemplate: boolean }) =>
      compiler.transformJSX_JS(SOURCE, 's.tsx', { ssr: true, ...o }).code,
  ],
  [
    'shipped',
    (o: { ssrTemplate: boolean }) =>
      compiler.transformJSX(SOURCE, 's.tsx', { ssr: true, ...o }).code,
  ],
] as const

describe('a signal method passed as a component prop under SSR (#4356)', () => {
  for (const [name, compile] of CASES) {
    for (const ssrTemplate of [false, true]) {
      test(`${name} backend, ssrTemplate=${ssrTemplate}`, async () => {
        const code = compile({ ssrTemplate })
        expect(code).toContain('choice.set.bind(choice)')
        const linked = linkImports(code)
        const js = transformSync(linked.body.replace(/^(\s*)export\s+/gm, '$1'), {
          loader: 'tsx',
          jsx: 'transform',
          jsxFactory: 'h',
          jsxFragment: 'Fragment',
        }).code
        const make = new Function('h', 'Fragment', 'Picker', ...linked.names, `${js}\nreturn App`)
        const App = make(h, core.Fragment, Picker, ...linked.values) as () => unknown
        const html = await renderToString(h(App as never, {}))
        expect(html).toContain('picked:11')
      })
    }
  }
})
