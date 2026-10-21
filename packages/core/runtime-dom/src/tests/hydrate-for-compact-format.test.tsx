/**
 * `<For>` hydration across SSR marker formats.
 *
 * The server carries the keys of a block's leading single-element rows once,
 * on the closing marker (`<!--/pyreon-for:k0 k1 …-->`), instead of one
 * `<!--k:KEY-->` comment per row. Hydration must:
 *
 *  - adopt that compact form with every row's identity kept;
 *  - still adopt the PREVIOUS format (a marker per row, plain closing marker) —
 *    HTML produced by an older server, or a prerendered page cached across a
 *    deploy, meets a newer client;
 *  - treat a key list that does not match the rows it describes as
 *    unadoptable and re-render, never adopt half a table or duplicate it.
 */
import { For, Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { disableHydrationWarnings, hydrateRoot } from '../index'

const app = (ids: () => number[]) =>
  h(
    'ul',
    null,
    h(For, { each: ids, by: (n: number) => n, children: (n: number) => h('li', null, `r${n}`) } as never),
    h('li', { class: 'tail' }, 'tail'),
  )

function hydrateHtml(html: string, ids: number[]) {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = Array.from(host.querySelectorAll('li'))
  const list = signal(ids)
  const dispose = hydrateRoot(host, app(() => list()) as never)
  return { host, before, list, dispose }
}

const rowsText = (host: Element) => Array.from(host.querySelectorAll('li')).map((li) => li.textContent)

describe('<For> hydration — SSR marker formats', () => {
  it('the server emits the compact form for single-element rows', async () => {
    const html = await renderToString(app(() => [1, 2, 3]) as never)
    expect(html).toBe(
      '<ul><!--pyreon-for--><li>r1</li><li>r2</li><li>r3</li><!--/pyreon-for:1 2 3--><li class="tail">tail</li></ul>',
    )
  })

  it('adopts the compact form, keeps identity, and normalizes the closing marker', async () => {
    disableHydrationWarnings()
    const html = await renderToString(app(() => [1, 2, 3]) as never)
    const { host, before, list, dispose } = hydrateHtml(html, [1, 2, 3])
    expect(Array.from(host.querySelectorAll('li'))).toEqual(before)
    expect(host.innerHTML).not.toContain('/pyreon-for:')
    list.set([3, 1])
    expect(rowsText(host)).toEqual(['r3', 'r1', 'tail'])
    expect(host.querySelectorAll('li')[0]).toBe(before[2])
    dispose()
    host.remove()
  })

  it('still adopts the previous per-row-marker format', () => {
    disableHydrationWarnings()
    const legacy =
      '<ul><!--pyreon-for--><!--k:1--><li>r1</li><!--k:2--><li>r2</li><!--k:3--><li>r3</li><!--/pyreon-for--><li class="tail">tail</li></ul>'
    const { host, before, list, dispose } = hydrateHtml(legacy, [1, 2, 3])
    expect(Array.from(host.querySelectorAll('li'))).toEqual(before)
    list.set([2, 3])
    expect(rowsText(host)).toEqual(['r2', 'r3', 'tail'])
    dispose()
    host.remove()
  })

  for (const [name, html] of [
    ['a key list shorter than the bare rows', '<!--/pyreon-for:1 2-->'],
    ['a key list longer than the bare rows', '<!--/pyreon-for:1 2 3 4-->'],
    ['bare rows with no key list', '<!--/pyreon-for-->'],
    ['keys that do not match the client', '<!--/pyreon-for:7 8 9-->'],
  ] as const) {
    it(`re-renders cleanly on ${name}`, () => {
      disableHydrationWarnings()
      const page = `<ul><!--pyreon-for--><li>r1</li><li>r2</li><li>r3</li>${html}<li class="tail">tail</li></ul>`
      const { host, dispose } = hydrateHtml(page, [1, 2, 3])
      // Exactly the client's rows — none adopted wrongly, none duplicated.
      expect(rowsText(host)).toEqual(['r1', 'r2', 'r3', 'tail'])
      dispose()
      host.remove()
    })
  }

  // Hydration consumes the `<!--$-->…<!--/$-->` markers around a reactive text
  // child, so the node the block scan recorded as a marked row's last node is
  // gone by the time the row is registered. The end must be taken from the
  // live DOM — and a text end gets its own comment, because a polymorphic text
  // binding later swaps that node for a subtree.
  for (const shape of ['text row', 'text-ending fragment row'] as const) {
    it(`a hydrated ${shape} that upgrades to an element still moves correctly`, async () => {
      disableHydrationWarnings()
      type R = { k: number; l: ReturnType<typeof signal<string>> }
      const mk = (): R[] => [1, 2, 3].map((k) => ({ k, l: signal(`L${k}`) }))
      const cell = (x: R) => () => (x.l().startsWith('R') ? h('b', null, x.l()) : x.l())
      const row = (x: R) => (shape === 'text row' ? cell(x) : h(Fragment, null, h('li', null, 'p'), cell(x)))
      const view = (l: () => R[]) =>
        h('ul', null, h(For, { each: l, by: (x: R) => x.k, children: row } as never), h('i', null, 't'))
      const html = await renderToString(view(() => mk()) as never)
      const host = document.createElement('div')
      host.innerHTML = html
      document.body.appendChild(host)
      const list = signal(mk())
      const dispose = hydrateRoot(host, view(() => list()) as never)
      list()[2]!.l.set('R3')
      list.set([...list()].reverse())
      const text = host.innerHTML.replace(/<!--[\s\S]*?-->/g, '')
      const p = shape === 'text row' ? '' : '<li>p</li>'
      expect(text).toBe(`<ul>${p}<b>R3</b>${p}L2${p}L1<i>t</i></ul>`)
      dispose()
      host.remove()
    })
  }
})
