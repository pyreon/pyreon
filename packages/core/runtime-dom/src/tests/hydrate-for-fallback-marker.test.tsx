/**
 * A `<For>` whose hydration cursor is not its own `<!--pyreon-for-->` block
 * (here: a divergent fixed sibling before it left the cursor on a stale server
 * node) mounts fresh before an inserted marker. That marker is only the
 * insertion point; it used to stay in the DOM as a stray `<!--pyreon-for-->` a
 * fresh render does not have. The list must stay live after the marker goes.
 *
 * Real compiler on both sides (client compiled with and without
 * `templatizeComponentChildren`, and the h() path), real `renderToString`.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import * as server from '@pyreon/runtime-server'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import { bindPolymorphicText } from '../mount'

const DEPS: Record<string, unknown> = {
  ...Object.fromEntries(Object.entries(dom).filter(([k]) => k.startsWith('_'))),
  ...Object.fromEntries(Object.entries(core).filter(([k]) => k.startsWith('_'))),
  bindPolymorphicText,
  _bind,
  renderEffect,
  signal,
  h,
  Fragment,
  For,
}

const SSR_DEPS = { ...DEPS, ...Object.fromEntries(Object.entries(server).filter(([k]) => k.startsWith('_'))) }

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, ''), { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code

type Client = 'compiled' | 'compiled, tcc' | 'h()'

function build(src: string, scope: Record<string, unknown>, side: 'server' | Client): () => unknown {
  const code =
    side === 'h()'
      ? src
      : transformJSX(src, 'case.tsx', {
          templatizeComponentChildren: side !== 'compiled',
          ...(side === 'server' ? { ssr: true } : {}),
        }).code
  const deps = { ...(side === 'server' ? SSR_DEPS : DEPS), ...scope }

  return new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)(...Object.values(deps)) as () => unknown
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

const SRC = 'const App = () => <div>{v}<For each={() => rows()} by={(r) => r}>{(r) => <li>{r}</li>}</For></div>'

describe('a <For> mounted over an unreadable block leaves no stray marker', () => {
  for (const client of ['compiled', 'compiled, tcc', 'h()'] as const) {
    it(client, async () => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      hosts.push(host)
      host.innerHTML = await renderToString(
        h(build(SRC, { rows: signal([1, 2]), v: [h('b', null, '1'), h('b', null, '2')] }, 'server') as never, null) as never,
      )
      const rows = signal([1, 2])
      const clientScope = { rows, v: [h('i', null, '1')] }
      dom.disableHydrationWarnings()
      try {
        dom.hydrateRoot(host, h(build(SRC, clientScope, client) as never, null))
      } finally {
        dom.enableHydrationWarnings()
      }
      const fresh = document.createElement('div')
      const freshRows = signal([1, 2])
      dom.mount(h(build(SRC, { ...clientScope, rows: freshRows }, client) as never, null), fresh)
      expect(host.innerHTML).not.toContain('pyreon-for')
      expect(host.innerHTML).toBe(fresh.innerHTML)
      // Still live: the list re-renders after the marker is gone.
      rows.set([1, 2, 3])
      freshRows.set([1, 2, 3])
      expect(host.innerHTML).toBe(fresh.innerHTML)
      expect(host.querySelectorAll('li')).toHaveLength(3)
    })
  }
})
