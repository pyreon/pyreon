/**
 * REAL CHROMIUM: a `<Suspense>` suspended by a descendant mounted AFTER it
 * resolved keeps its content mounted off-screen, so a field the user typed into
 * comes back with its text (the dirty value, which a rebuild would lose) and the
 * same node. Moving nodes through a DocumentFragment and back is exactly the
 * kind of DOM behaviour happy-dom is not trusted with.
 */
import type { ComponentFn } from '@pyreon/core'
import { h, lazy, Show, Suspense } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { describe, expect, it } from 'vitest'
import { mount } from '../index'

describe('<Suspense> nested suspension — real Chromium', () => {
  it('typed text survives the content going off-screen and back', async () => {
    const show = signal(false)
    let land!: () => void
    const Extra: ComponentFn = () => h('p', { class: 'extra' }, 'extra')
    const Lazy = lazy(() => new Promise<{ default: ComponentFn }>((r) => (land = () => r({ default: Extra }))))
    const c = document.createElement('div')
    document.body.appendChild(c)
    const dispose = mount(
      h(
        Suspense,
        { fallback: h('i', { class: 'fb' }, 'loading') },
        h('form', null, h('input', { class: 'in' }), h(Show, { when: () => show() }, h(Lazy, null))),
      ),
      c,
    )
    const input = query<HTMLInputElement>(c, 'input.in')
    input.focus()
    document.execCommand('insertText', false, 'pyreon')

    show.set(true)
    expect(c.querySelector('.fb')).not.toBeNull()
    expect(input.isConnected).toBe(false)

    land()
    await new Promise((r) => setTimeout(r, 20))
    expect(c.querySelector('.fb')).toBeNull()
    expect(c.querySelector('input.in')).toBe(input)
    expect(input.isConnected).toBe(true)
    expect(input.value).toBe('pyreon')
    expect(c.querySelector('.extra')).not.toBeNull()
    dispose()
    c.remove()
  })
})
