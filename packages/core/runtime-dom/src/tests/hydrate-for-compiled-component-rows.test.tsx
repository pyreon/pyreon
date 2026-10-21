/**
 * `<For>` over COMPONENT rows through the real compiler on both sides — the
 * shape an app ships: the server component lowers to `_ssr(...)` (with
 * `ssrTemplate`, the vite-plugin default) and the client one to `_tpl(...)`.
 *
 * A component row that renders exactly one element carries no per-row marker
 * (its key rides on the closing marker, like a plain element row). These specs
 * prove that the compiled server output is classified as one element, that the
 * client adopts every server row in place, and that the rows stay correct and
 * reactive through reorders afterwards. A row component using the
 * reactive-conditional return keeps its per-row marker.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import * as server from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import * as dom from '../index'

const MODULES: Record<string, Record<string, unknown>> = {
  '@pyreon/core': core,
  '@pyreon/reactivity': reactivity,
  '@pyreon/runtime-server': server,
  '@pyreon/runtime-dom': dom as Record<string, unknown>,
}

/** Compile `src` (which must define `App`) and evaluate it with its real imports. */
function compile(src: string, ssr: boolean): (props: Record<string, unknown>) => unknown {
  const { code } = transformJSX(src, 'app.tsx', (ssr ? { ssr: true, ssrTemplate: true } : {}) as never)
  const names: string[] = ['h', 'Fragment', 'For']
  const values: unknown[] = [core.h, core.Fragment, core.For]
  for (const m of code.matchAll(/^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm)) {
    const mod = MODULES[m[2] as string]
    if (!mod) throw new Error(`unexpected import ${m[2]}`)
    for (const spec of (m[1] as string).split(',')) {
      const [imported, local] = spec.trim().split(/\s+as\s+/)
      if (!imported) continue
      const name = (local ?? imported).trim()
      if (names.includes(name)) continue
      names.push(name)
      values.push(mod[imported.trim()])
    }
  }
  const body = transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  return new Function(...names, `${body}\nreturn App`)(...values) as (p: Record<string, unknown>) => unknown
}

const SINGLE = `
function Row(props) {
  return <li class={props.sel() === props.row.id ? 'on' : ''}>{props.row.label()}</li>
}
function App(props) {
  return (
    <ul>
      <For each={props.rows} by={(r) => r.id}>{(r) => <Row row={r} sel={props.sel} />}</For>
      <li class="tail">tail</li>
    </ul>
  )
}
`

const REACTIVE = `
function Row(props) {
  return () => (props.row.label().startsWith('R') ? <b>{props.row.label()}</b> : <li>{props.row.label()}</li>)
}
function App(props) {
  return (
    <ul>
      <For each={props.rows} by={(r) => r.id}>{(r) => <Row row={r} />}</For>
      <li class="tail">tail</li>
    </ul>
  )
}
`

type Row = { id: number; label: reactivity.Signal<string> }
const mkRows = (): Row[] => [1, 2, 3].map((id) => ({ id, label: reactivity.signal(`L${id}`) }))
const text = (el: Element) => el.innerHTML.replace(/<!--[\s\S]*?-->/g, '')

async function ssrAndHydrate(src: string) {
  const ServerApp = compile(src, true)
  const ClientApp = compile(src, false)
  const sRows = reactivity.signal(mkRows())
  const html = await server.renderToString(
    core.h(ServerApp as core.ComponentFn, { rows: () => sRows(), sel: reactivity.signal(2) }),
  )
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = Array.from(host.querySelectorAll('li, b'))
  const rows = reactivity.signal(mkRows())
  const sel = reactivity.signal(2)
  const mismatches: string[] = []
  const off = dom.onHydrationMismatch((ctx) => mismatches.push(`${ctx.type}@${ctx.path}`))
  const dispose = dom.hydrateRoot(host, core.h(ClientApp as core.ComponentFn, { rows: () => rows(), sel }))
  off()
  return { html, host, before, rows, sel, mismatches, dispose }
}

describe('<For> component rows — compiled server + compiled client', () => {
  it('a single-element compiled component row ships bare and is adopted in place', async () => {
    dom.disableHydrationWarnings()
    const { html, host, before, rows, sel, mismatches, dispose } = await ssrAndHydrate(SINGLE)
    expect(html).not.toContain('<!--k:')
    expect(html).toContain('<!--/pyreon-for:1 2 3-->')
    expect(mismatches).toEqual([])
    expect(Array.from(host.querySelectorAll('li'))).toEqual(before)
    expect(text(host)).toBe('<ul><li class="">L1</li><li class="on">L2</li><li class="">L3</li><li class="tail">tail</li></ul>')

    // Reactive after adoption, and correct through a reorder.
    sel.set(3)
    rows()[0]!.label.set('X1')
    rows.set([...rows()].reverse())
    expect(text(host)).toBe(
      '<ul><li class="on">L3</li><li class="">L2</li><li class="">X1</li><li class="tail">tail</li></ul>',
    )
    expect(host.querySelectorAll('li')[0]).toBe(before[2])
    dispose()
    host.remove()
  })

  it('a component using the reactive-conditional return keeps its per-row marker and survives a swap + reorder', async () => {
    dom.disableHydrationWarnings()
    const { html, host, rows, mismatches, dispose } = await ssrAndHydrate(REACTIVE)
    expect(html).toContain('<!--k:1-->')
    expect(mismatches).toEqual([])
    rows()[2]!.label.set('R3')
    rows.set([...rows()].reverse())
    expect(text(host)).toBe('<ul><b>R3</b><li>L2</li><li>L1</li><li class="tail">tail</li></ul>')
    dispose()
    host.remove()
  })
})
