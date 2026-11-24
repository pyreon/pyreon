/**
 * A reactive text binding builds its text↔subtree swap core only when a
 * non-text value first arrives. Almost every text binding only ever sees text,
 * and the eager core (an object with three closures over an 8-slot context)
 * was retained by every one of them for the binding's lifetime.
 *
 * The `runtime.polyTextCore` dev counter counts core constructions. Each
 * shape below checks both halves: no core while the value is text, and the
 * full swap behaviour once one is built.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../hydrate'
import { mount } from '../index'
import { bindPolymorphicText } from '../mount'

const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let cores = 0
let prev: typeof g.__pyreon_count__

beforeEach(() => {
  cores = 0
  prev = g.__pyreon_count__
  g.__pyreon_count__ = (name) => {
    if (name === 'runtime.polyTextCore') cores++
  }
})

afterEach(() => {
  g.__pyreon_count__ = prev
})

describe('bindPolymorphicText — lazy swap core', () => {
  it('builds no core while the value stays text, and updates in place', () => {
    const host = document.createElement('div')
    const text = document.createTextNode('')
    host.appendChild(text)
    const s = signal<unknown>('a')
    const dispose = bindPolymorphicText(() => s() as string, text, host)
    expect(host.textContent).toBe('a')
    s.set(1)
    expect(host.textContent).toBe('1')
    s.set(null)
    expect(host.textContent).toBe('')
    s.set(false)
    expect(host.textContent).toBe('')
    s.set('b')
    expect(host.textContent).toBe('b')
    expect(cores).toBe(0)
    // Disposing a never-upgraded binding unsubscribes and leaves the node.
    dispose()
    s.set('c')
    expect(host.textContent).toBe('b')
    expect(host.firstChild).toBe(text)
    expect(cores).toBe(0)
  })

  it('swaps text → subtree → text after building the core on demand', () => {
    const host = document.createElement('div')
    const text = document.createTextNode('')
    host.appendChild(text)
    const s = signal<unknown>('a')
    const dispose = bindPolymorphicText(() => s() as never, text, host)
    expect(cores).toBe(0)
    s.set(h('b', null, 'bold'))
    expect(cores).toBe(1)
    expect(host.innerHTML).toBe('<b>bold</b><!--pyreon-->')
    s.set('back')
    expect(host.innerHTML).toBe('back')
    expect(host.firstChild).toBe(text)
    s.set(h('i', null, 'again'))
    expect(host.innerHTML).toBe('<i>again</i><!--pyreon-->')
    // Still one core: it is reused for every later swap.
    expect(cores).toBe(1)
    dispose()
    expect(host.querySelector('i')).toBeNull()
    s.set('after')
    expect(host.textContent).toBe('')
  })

  it('a first value that is already a subtree builds the core at setup and disposes it', () => {
    const host = document.createElement('div')
    const text = document.createTextNode('')
    host.appendChild(text)
    const dispose = bindPolymorphicText(() => h('em', null, 'x'), text, host)
    expect(cores).toBe(1)
    expect(host.innerHTML).toBe('<em>x</em><!--pyreon-->')
    // Dead (no signal read) but holding a subtree: its disposer must remove it.
    dispose()
    expect(host.innerHTML).toBe('')
  })
})

describe('mountChild accessor child — lazy swap core', () => {
  it('builds no core for a textish accessor and still upgrades on demand', () => {
    const host = document.createElement('div')
    const s = signal<unknown>('x')
    const unmount = mount(h('div', null, () => s() as never), host)
    expect(host.innerHTML).toBe('<div>x</div>')
    s.set('y')
    expect(host.innerHTML).toBe('<div>y</div>')
    expect(cores).toBe(0)
    s.set(h('span', null, 'node'))
    expect(cores).toBe(1)
    expect(host.innerHTML).toBe('<div><span>node</span><!--pyreon--></div>')
    s.set('z')
    expect(host.innerHTML).toBe('<div>z</div>')
    unmount()
    expect(host.innerHTML).toBe('')
  })
})

describe('hydration adoption of a poly text binding', () => {
  it('adopts the server text node without a core and keeps it live', () => {
    const host = document.createElement('div')
    host.innerHTML = '<p>server</p>'
    const serverText = host.querySelector('p')!.firstChild
    const s = signal<unknown>('server')
    const dispose = hydrateRoot(host, h('p', null, () => s() as never))
    expect(host.querySelector('p')!.firstChild).toBe(serverText)
    expect(cores).toBe(0)
    s.set('client')
    expect(host.innerHTML).toBe('<p>client</p>')
    expect(host.querySelector('p')!.firstChild).toBe(serverText)
    s.set(h('b', null, 'up'))
    expect(cores).toBe(1)
    expect(host.innerHTML).toBe('<p><b>up</b><!--pyreon--></p>')
    s.set('down')
    expect(host.innerHTML).toBe('<p>down</p>')
    dispose()
  })
})
