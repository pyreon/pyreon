/**
 * #4382 (client half of the class): `<Transition>` with a LITERAL element
 * child — the documented usage — receives a compiled `_tpl` item, not a VNode.
 * It fell into the component branch: a dev warning "Transition child is a
 * component" and no ref, so hiding removed the element at once with no leave
 * transition and showing it ran no enter transition.
 *
 * Compiled through the REAL `transformJSX`: vitest's JSX transform never emits
 * `_tpl`, so the h()-only suite could not see this.
 */
import { transformJSX } from '@pyreon/compiler'
import { _lc, Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { _tpl, mount } from '../index'
import { Transition } from '../transition'

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

function compile(src: string, show: () => boolean): () => unknown {
  const { code } = transformJSX(src, 'case.tsx')
  const body = transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const deps = { _tpl, _lc, h, Fragment, Transition, show }

  return new Function(...Object.keys(deps), `${body}\nreturn App`)(...Object.values(deps)) as () => unknown
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

describe('<Transition> over a compiled literal child (#4382)', () => {
  it('lowers the child to a _tpl item (the premise)', () => {
    const { code } = transformJSX(
      'const App = () => <Transition name="fade" show={() => show()}><div class="box">x</div></Transition>',
      'case.tsx',
    )
    expect(code).toContain('_tpl("<div class=\\"box\\">x</div>"')
  })

  it('animates leave and enter on the compiled element, with no warning', async () => {
    const show = signal(true)
    const App = compile(
      'const App = () => <Transition name="fade" show={() => show()}><div class="box">x</div></Transition>',
      () => show(),
    )
    const warns: string[] = []
    const orig = console.warn
    console.warn = (m: unknown) => warns.push(String(m))
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    try {
      mount(h(App as never, null), host)
      const first = host.querySelector('.box')
      expect(first).not.toBeNull()

      show.set(false)
      await flush()
      // Leaving, not gone: the leave classes are on the compiled element.
      const leaving = host.querySelector('.box')
      expect(leaving).toBe(first)
      expect(leaving!.classList.contains('fade-leave-active')).toBe(true)

      leaving!.dispatchEvent(new Event('transitionend'))
      await flush()
      expect(host.querySelector('.box')).toBeNull()

      show.set(true)
      await flush()
      await flush()
      const entered = host.querySelector('.box')
      expect(entered).not.toBeNull()
      expect(entered!.classList.contains('fade-enter-active')).toBe(true)
    } finally {
      console.warn = orig
    }
    expect(warns.filter((w) => w.includes('Transition child is a component'))).toEqual([])
  })
})
