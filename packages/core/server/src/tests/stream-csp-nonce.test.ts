import { h } from '@pyreon/core'
import { RouterView } from '@pyreon/router'
import { createHandler } from '../handler'
import type { Middleware } from '../middleware'

// String mode put the request's CSP nonce on its inline scripts; the
// streaming path did not, so a strict nonce policy blocked loader data (and
// the Suspense swaps) on every streamed page.
describe('createHandler — stream mode carries the CSP nonce', () => {
  it('every inline script in a streamed page has the request nonce', async () => {
    const setNonce: Middleware = (ctx) => {
      ctx.locals.cspNonce = 'n0nce42'
    }
    const Page = () => h('p', null, 'page')
    const routes = [{ path: '/', component: Page, loader: async () => ({ ok: 1 }) }]
    const handler = createHandler({
      App: () => h(RouterView, null),
      routes,
      mode: 'stream',
      middleware: [setNonce],
      clientEntry: false,
    })
    const html = await (await handler(new Request('http://localhost/'))).text()
    const inline = (html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? [])
    expect(html).toContain('__PYREON_LOADER_DATA__')
    expect(inline.length).toBeGreaterThan(0)
    for (const tag of inline) expect(tag).toContain('nonce="n0nce42"')
  })
})
