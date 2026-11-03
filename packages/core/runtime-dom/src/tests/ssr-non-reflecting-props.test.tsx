/**
 * Server/client agreement for props the client sets as a PROPERTY that maps
 * onto a different content attribute (`defaultValue` -> `value`,
 * `defaultChecked` -> `checked`, `defaultMuted` -> `muted`) or onto none
 * (`indeterminate`, `currentTime`, ...). SSR used to kebab-case them into
 * attributes no browser reads, so the server HTML differed from a client
 * mount of the same props.
 */
import { h } from '@pyreon/core'
import { renderToStream, renderToString } from '@pyreon/runtime-server'
import { hydrateRoot, mountChild, onHydrationMismatch } from '../index'

async function streamToString(vnode: Parameters<typeof renderToStream>[0]): Promise<string> {
  const reader = renderToStream(vnode).getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += value
  }
  return out
}

const tree = () =>
  h(
    'form',
    null,
    h('input', { defaultValue: 'x' }),
    h('input', { type: 'checkbox', defaultChecked: true }),
    h('textarea', { defaultValue: 'draft' }),
    h('input', { type: 'checkbox', indeterminate: true }),
  )

describe('props with a different content attribute, or none', () => {
  it('the string and stream renderers agree', async () => {
    expect(await streamToString(tree())).toBe(await renderToString(tree()))
  })

  it('SSR emits the attributes a client mount produces', async () => {
    const html = await renderToString(tree())
    const server = document.createElement('div')
    server.innerHTML = html
    const client = document.createElement('div')
    mountChild(tree(), client)
    const s = server.querySelectorAll('input')
    const c = client.querySelectorAll('input')
    expect(s[0]!.getAttribute('value')).toBe('x')
    expect(s[0]!.getAttribute('value')).toBe(c[0]!.getAttribute('value'))
    expect(s[1]!.hasAttribute('checked')).toBe(c[1]!.hasAttribute('checked'))
    expect(server.querySelector('textarea')!.value).toBe('draft')
    expect(server.querySelector('textarea')!.value).toBe(client.querySelector('textarea')!.value)
    expect(s[2]!.hasAttribute('indeterminate')).toBe(false)
  })

  it('hydrating the server HTML reports no mismatch', async () => {
    const container = document.createElement('div')
    container.innerHTML = await renderToString(tree())
    const mismatches: unknown[] = []
    const off = onHydrationMismatch((m) => mismatches.push(m))
    const dispose = hydrateRoot(container, tree())
    off()
    dispose()
    expect(mismatches).toEqual([])
  })
})
