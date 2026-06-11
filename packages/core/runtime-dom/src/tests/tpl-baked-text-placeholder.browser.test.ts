/**
 * PR-A (create-path perf audit) — the compiler's sole-dynamic-text-child
 * emit bakes a single-space text node INTO the template HTML and binds via
 * `.firstChild` instead of `createTextNode("") + appendChild` per
 * instantiation. This spec locks the RUNTIME behavior of that emit shape in
 * real Chromium: the baked space never renders (every binding path writes
 * the initial value synchronously at bind time), reactivity works against
 * the parsed-from-HTML text node, and the shape survives table
 * foster-parenting contexts.
 *
 * The shapes below are EXACTLY what the compiler emits post-PR-A (see
 * compiler jsx.test.ts "sole dynamic text child — BAKED placeholder").
 */
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { _bindText, _tpl } from '../template'

const containers: HTMLElement[] = []
function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  containers.push(el)
  return el
}
afterEach(() => {
  for (const el of containers.splice(0)) el.remove()
})

describe('baked text placeholder (compiler PR-A emit shape)', () => {
  it('initial value renders with NO space artifact; updates patch in place', () => {
    const label = signal('hello')
    const item = _tpl('<td> </td>', (__root) => {
      const __t = __root.firstChild as Text
      return _bindText(label, __t)
    })
    const host = container()
    host.appendChild(item.el as Node)
    // The baked space was overwritten synchronously at bind time.
    expect(host.textContent).toBe('hello')
    expect((item.el as HTMLElement).childNodes.length).toBe(1)

    label.set('world')
    expect(host.textContent).toBe('world')
    item.cleanup?.()
  })

  it('table-context (tbody sole child): whitespace survives parsing → firstChild IS the text node', () => {
    const content = signal('row-text')
    const item = _tpl('<tbody> </tbody>', (__root) => {
      // If foster-parenting had moved the space out, firstChild would be
      // null and this bind would crash — the spec proves it doesn't.
      const __t = __root.firstChild as Text
      expect(__t).not.toBeNull()
      expect(__t.nodeType).toBe(Node.TEXT_NODE)
      return _bindText(content, __t)
    })
    const host = container()
    host.appendChild(item.el as Node)
    expect(host.textContent).toBe('row-text')
    item.cleanup?.()
  })

  it('the full benchmark row shape: static td + baked-placeholder td, reactive label', () => {
    const label = signal('initial')
    const item = _tpl('<tr><td></td><td> </td></tr>', (__root) => {
      const __e0 = __root.firstElementChild as HTMLElement
      __e0.textContent = 'id-1'
      const __e1 = __e0.nextElementSibling as HTMLElement
      const __t = __e1.firstChild as Text
      return _bindText(label, __t)
    })
    // tr must live in a table to behave; use a real tbody host.
    const host = container()
    host.innerHTML = '<table><tbody></tbody></table>'
    const tbody = host.querySelector('tbody') as HTMLElement
    tbody.appendChild(item.el as Node)
    expect(tbody.textContent).toBe('id-1initial')
    label.set('updated')
    expect(tbody.textContent).toBe('id-1updated')
    item.cleanup?.()
  })
})
