import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { flush } from '@pyreon/test-utils/browser'
import { bindPolymorphicText } from '../index'

describe('reactive VNode[] child — real-browser swap + cleanup', () => {
  const hosts: HTMLElement[] = []
  afterEach(() => { hosts.forEach((h) => h.remove()); hosts.length = 0 })

  it('array → string tears down the mounted subtree, then re-mounts', async () => {
    const items = signal<any>([h('li', { class: 'r' }, '1'), h('li', { class: 'r' }, '2')])
    const ul = document.createElement('ul')
    const tn = document.createTextNode('')
    ul.append(tn)
    document.body.append(ul); hosts.push(ul)

    const dispose = bindPolymorphicText(() => items(), tn, ul)
    await flush()
    expect(ul.querySelectorAll('li.r').length).toBe(2)
    expect(ul.textContent).toBe('12')

    items.set('done'); await flush()
    expect(ul.querySelectorAll('li.r').length).toBe(0) // subtree torn down
    expect(ul.textContent).toContain('done')

    items.set([h('li', { class: 'r' }, 'X')]); await flush()
    expect(ul.querySelectorAll('li.r').length).toBe(1) // re-mounts
    dispose()
  })
})
