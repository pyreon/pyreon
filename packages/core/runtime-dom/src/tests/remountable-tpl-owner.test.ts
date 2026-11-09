/**
 * A compiled template that is a COMPONENT's child (`_tpl(html, bind, 1)`) is created while the parent's JSX arguments
 * are evaluated — before the enclosing component's setup. It must not build (and so must not mount the components its
 * bind holds) until it is mounted: otherwise those components set up under the wrong owner and never see the context
 * the enclosing component provides. Seen as `examples/chat`'s routed page throwing "No QueryClient found" under a
 * `<QueryClientProvider>` layout.
 */
import { createContext, h, provide, useContext } from '@pyreon/core'
import { afterEach, describe, expect, test } from 'vitest'
import { mountChild } from '../index'
import { _mountChild, _tpl } from '../template'

const Ctx = createContext<string | null>(null)

function Provide(props: { value: string; children?: unknown }) {
  provide(Ctx, props.value)
  return props.children as never
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('remountable _tpl builds on mount, inside the right owner', () => {
  test('a component inside the template sees the context its enclosing provider provides', () => {
    const seen: (string | null)[] = []
    const Reader = () => {
      seen.push(useContext(Ctx))
      return h('i', { id: 'reader' }, 'r')
    }
    const Chrome = () => h('aside', null, 'rail')
    const App = () =>
      // The template is created HERE, as an argument, before `Provide` has run.
      h(
        Provide,
        { value: 'ok' },
        h(
          'div',
          null,
          h(Chrome, null),
          _tpl('<main data-pyreon-hole></main>', (root) => _mountChild(h(Reader, null), root as never, null) as never, 1),
        ),
      )
    const container = document.createElement('div')
    document.body.appendChild(container)
    mountChild(h(App, null), container)
    expect(container.querySelector('#reader')).not.toBeNull()
    expect(seen).toEqual(['ok'])
  })

  test('creating the item does not build it', () => {
    let binds = 0
    _tpl('<p></p>', () => {
      binds++
      return null
    }, 1)
    expect(binds).toBe(0)
  })
})
