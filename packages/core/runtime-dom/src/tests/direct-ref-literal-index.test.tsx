/**
 * Direct-tier binding through a LITERAL index or a TS type layer.
 *
 * `{row.queries[0].elapsed()}` and `{(row.cell as Cell).elapsed()}` are as
 * stable as `{row.cell.elapsed()}` — a literal key never changes, and a cast is
 * erased — yet both used to compile to a fully tracked binding (one effect
 * re-run per update) instead of `_bindText` / `_bindDirect`, which register the
 * signal's direct subscriber slot. A per-cell dashboard paid that on every cell.
 *
 * Compiled through the REAL transform: vitest's own JSX never emits these
 * bindings. The `_d1` assertions are what distinguish the tiers — both update
 * the DOM correctly, so a DOM-only check passes either way.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { signal, renderEffect } from '@pyreon/reactivity'
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { h, Fragment, _rp, cx } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { mountChild } from '../mount'
import { _tpl, _bindText, _bindDirect, _setClass, bindPolymorphicText } from '../index'

const DEPS = { _tpl, _bindText, _bindDirect, _setClass, bindPolymorphicText, renderEffect, _rp, _cx: cx, h, Fragment, document }

const mounted: Array<() => void> = []
afterEach(() => {
  while (mounted.length) mounted.pop()?.()
  document.body.innerHTML = ''
})

// The compiler's output keeps TypeScript syntax (a later build step strips it),
// so strip types before evaluating it.
const toJs = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, ''), { loader: 'ts' }).code.trim().replace(/;$/, '')

function compileAndMount(source: string, row: unknown) {
  const { code } = transformJSX(source, 'test.tsx')
  const body = toJs(code)
  const names = [...Object.keys(DEPS), 'row']
  const fn = new Function(...names, `return ${body}`)
  const vnode = fn(...Object.values(DEPS), row)
  const container = document.createElement('div')
  document.body.appendChild(container)
  mounted.push(mountChild(vnode, container, null))
  return container
}

const directSlot = (s: unknown) => (s as { _d1: unknown })._d1

describe('direct-tier binding through a literal index or a type layer', () => {
  it('a literal index binds text and class directly and stays live', () => {
    const cell = { elapsed: signal('1.0'), cls: signal('a') }
    const row = { queries: [cell] }
    const c = compileAndMount('<td class={row.queries[0].cls()}>{row.queries[0].elapsed()}</td>', row)
    const td = query(c, 'td')
    expect(td.textContent).toBe('1.0')
    expect(td.className).toBe('a')
    expect(directSlot(cell.elapsed)).not.toBeNull()
    expect(directSlot(cell.cls)).not.toBeNull()
    cell.elapsed.set('2.5')
    cell.cls.set('b')
    expect(td.textContent).toBe('2.5')
    expect(td.className).toBe('b')
  })

  it('a TS cast in the chain binds directly and stays live', () => {
    const cell = { v: signal('x') }
    const row = { cell }
    const c = compileAndMount('<td>{(row.cell as Cell).v()}</td>', row)
    const td = query(c, 'td')
    expect(directSlot(cell.v)).not.toBeNull()
    cell.v.set('y')
    expect(td.textContent).toBe('y')
  })

  it('a dynamic index keeps the general path and still updates', () => {
    const cell = { v: signal('p') }
    const row = { queries: [cell] }
    const i = 0
    const { code } = transformJSX('<td>{row.queries[i].v()}</td>', 'test.tsx')
    expect(code).not.toContain('_bindText(')
    const fn = new Function(...Object.keys(DEPS), 'row', 'i', `return ${toJs(code)}`)
    const container = document.createElement('div')
    document.body.appendChild(container)
    mounted.push(mountChild(fn(...Object.values(DEPS), row, i), container, null))
    cell.v.set('q')
    expect(query(container, 'td').textContent).toBe('q')
  })
})
