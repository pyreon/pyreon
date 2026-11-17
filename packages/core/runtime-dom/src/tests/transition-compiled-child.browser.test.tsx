/**
 * Real-Chromium twin of `transition-compiled-child.test.tsx` (#4382): a
 * `<Transition>` over a compiled `_tpl` child applies its leave classes to the
 * real element in Chromium, removes it on `transitionend`, and enters on
 * re-show. The compiled shape is the one the happy-dom twin
 * locks through `transformJSX`: `_lc(() => _tpl(html, () => null, 1))`.
 */
import { _lc, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { _tpl, mount } from '../index'
import { Transition } from '../transition'

const css = document.createElement('style')

css.textContent = `
  .fade-enter-active, .fade-leave-active { transition: opacity 40ms linear; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
`

document.head.appendChild(css)

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

const frames = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await new Promise<void>((r) => setTimeout(r, 0))
}

describe('<Transition> over a compiled child in Chromium (#4382)', () => {
  it('applies the leave classes to the compiled element and removes it on transitionend, then enters', async () => {
    const show = signal(true)
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const child = _lc(() => _tpl('<div class="box">x</div>', () => null, 1))
    mount(h(Transition, { name: 'fade', show: () => show() }, child as never), host)
    const first = host.querySelector('.box') as HTMLElement
    expect(first).not.toBeNull()

    show.set(false)
    await frames(2)
    // Leaving, not gone: the leave classes are on the SAME compiled element.
    expect(host.querySelector('.box')).toBe(first)
    expect(first.classList.contains('fade-leave-active')).toBe(true)
    expect(first.classList.contains('fade-leave-to')).toBe(true)
    // Short-circuit the 5s safety timeout, as the h() Transition spec does.
    first.dispatchEvent(new Event('transitionend', { bubbles: true }))
    await frames(1)
    expect(host.querySelector('.box')).toBeNull()

    show.set(true)
    await frames(2)
    const entered = host.querySelector('.box') as HTMLElement
    expect(entered).not.toBeNull()
    expect(entered.classList.contains('fade-enter-active')).toBe(true)
  })
})
