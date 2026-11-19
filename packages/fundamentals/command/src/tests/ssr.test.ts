// @vitest-environment node
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { createCommands, provideCommands, useCommand, useCommands } from '../index'

describe('the registry is inert on the server', () => {
  it('there is no document, so nothing registers, nothing is listed, nothing is kept between requests', () => {
    expect(typeof document).toBe('undefined')
    const c = createCommands()
    const off = c.register({ id: 'a', title: 'A', shortcut: 'mod+k' })
    expect(c.commands()).toEqual([])
    expect(c.search('a')).toEqual([])
    expect(c.get('a')).toBeUndefined()
    off()
  })

  it('a component that calls useCommand renders its markup and registers nothing in the shared default registry', async () => {
    const Page = (): unknown => {
      useCommand({ id: 'page', title: 'Page', shortcut: 'mod+p' })
      return h('p', null, 'hello')
    }
    const html = await renderToString(h(Page as never, null))
    expect(html).toBe('<p>hello</p>')
    expect(useCommands().commands()).toEqual([])
  })

  it('provideCommands and useCommands work on the server and hand back the provided registry', async () => {
    const own = createCommands()
    let seen: unknown
    const Child = (): unknown => {
      seen = useCommands()
      return h('i', null)
    }
    const Root = (): unknown => {
      provideCommands(own)
      return h(Child as never, null)
    }
    await renderToString(h(Root as never, null))
    expect(seen).toBe(own)
  })

  it('formatting a shortcut does not need a browser', async () => {
    const { formatShortcut } = await import('../shortcuts')
    expect(formatShortcut('mod+k')).toBe('Ctrl+K')
  })
})
