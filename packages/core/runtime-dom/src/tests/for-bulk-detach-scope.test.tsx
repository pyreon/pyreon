/**
 * The bulk-detach window (#3902) skips a `<For>`'s row removals while the
 * list's parent element leaves the document as a unit. The skip must be
 * SCOPED to that parent's subtree: a row's `onUnmount` that tears down an
 * UNRELATED tree (a separate root, a node elsewhere in the document) runs
 * inside the window too, and that tree does not leave with the parent. While
 * the skip was a module-wide flag, every `detachNode` in the window was a
 * no-op, so the unrelated node stayed in the document (v0.53.0 removed it).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { For, h, onUnmount } from '@pyreon/core'
import { mount } from '../index'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('<For> bulk detach is scoped to the detaching parent', () => {
  it('a row onUnmount that disposes a separate root still removes that root', () => {
    const otherHost = document.createElement('section')
    document.body.appendChild(otherHost)
    const disposeOther = mount(h('div', { id: 'other' }, 'other'), otherHost)
    expect(document.getElementById('other')).not.toBeNull()

    const RowItem = (props: { id: number }) => {
      onUnmount(() => {
        if (props.id === 0) disposeOther()
      })
      return h('li', null, String(props.id))
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const unmount = mount(
      h(
        'ul',
        null,
        h(For, {
          each: () => [0, 1, 2],
          by: (x: number) => x,
          children: (x: number) => h(RowItem, { id: x }),
        }),
      ),
      container,
    )
    expect(container.querySelectorAll('li')).toHaveLength(3)
    unmount()
    expect(container.childNodes.length).toBe(0)
    expect(document.getElementById('other')).toBeNull()
  })

  it('the list rows themselves are still skipped (no per-row removal)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const unmount = mount(
      h(
        'ul',
        null,
        h(For, {
          each: () => Array.from({ length: 50 }, (_, i) => i),
          by: (x: number) => x,
          children: (x: number) => h('li', null, String(x)),
        }),
      ),
      container,
    )
    const orig = Node.prototype.removeChild
    let n = 0
    Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
      n++
      return orig.call(this, child) as T
    }
    try {
      unmount()
    } finally {
      Node.prototype.removeChild = orig
    }
    expect(n).toBeLessThan(5)
    expect(container.childNodes.length).toBe(0)
  })
})
