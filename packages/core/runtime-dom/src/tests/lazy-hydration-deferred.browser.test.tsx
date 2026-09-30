/**
 * REAL CHROMIUM: a user interacts with server-rendered content inside a lazy
 * whose client chunk has not landed yet — types into a field, focuses it —
 * and the chunk then lands. Before deferred lazy hydration the range was
 * discarded and rebuilt, so the typed text, the focus and any listener
 * non-Pyreon code attached were lost. Typing, focus and the dirty-value flag
 * are exactly what happy-dom under-models, so this lock lives here.
 *
 * The server HTML is the literal string `renderToString` emits for this tree
 * (a lazy's reactive output is bracketed `<!--$-->…<!--/$-->`); the node-side
 * specs in `lazy-hydration-deferred.test.tsx` render it for real.
 */
import type { ComponentFn } from '@pyreon/core'
import { h, lazy, Suspense } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { describe, expect, it } from 'vitest'
import { hydrateRoot } from '../index'

const Search: ComponentFn = () =>
  h('form', { class: 'f' }, h('input', { name: 'q', class: 'q' }), h('button', { type: 'button' }, 'go'))

const SERVER = {
  bare: '<main><!--$--><form class="f"><input name="q" class="q" /><button type="button">go</button></form><!--/$--><b>after</b></main>',
  suspense:
    '<main><!--$--><!--$--><form class="f"><input name="q" class="q" /><button type="button">go</button></form><!--/$--><!--/$--><b>after</b></main>',
}

describe('deferred lazy hydration — real Chromium', () => {
  for (const shape of ['bare', 'suspense'] as const) {
    it(`${shape}: typed text, focus and a foreign listener survive the chunk landing`, async () => {
      const c = document.createElement('div')
      document.body.appendChild(c)
      c.innerHTML = SERVER[shape]
      const input = query<HTMLInputElement>(c, 'input.q')
      let foreign = 0
      input.addEventListener('input', () => foreign++)

      let land!: () => void
      const Lazy = lazy(() => new Promise<{ default: ComponentFn }>((r) => (land = () => r({ default: Search }))))
      const node = h(Lazy, null)
      const tree = h(
        'main',
        null,
        shape === 'suspense' ? h(Suspense, { fallback: h('i', { class: 'fb' }, 'l') }, node) : node,
        h('b', null, 'after'),
      )
      const dispose = hydrateRoot(c, tree)

      // The user types BEFORE the chunk lands.
      input.focus()
      document.execCommand('insertText', false, 'pyreon')
      expect(input.value).toBe('pyreon')
      expect(c.querySelector('.fb')).toBeNull()

      land()
      await new Promise((r) => setTimeout(r, 20))

      expect(c.querySelector('input.q')).toBe(input)
      expect(input.value).toBe('pyreon')
      expect(document.activeElement).toBe(input)
      document.execCommand('insertText', false, '!')
      expect(foreign).toBe(2)
      expect(c.querySelectorAll('form').length).toBe(1)
      dispose()
      c.remove()
    })
  }
})
