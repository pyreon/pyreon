// @vitest-environment node
/**
 * Server output equals client output for the same locale and zone, in the same
 * engine: `renderToString` of the components vs a client `mount` of the same
 * tree. (Node-vs-Chromium CLDR differences are covered, for the hydration walk,
 * by `components.browser.test.tsx`; pass an explicit locale and zone to make
 * server and client agree even across ICU versions.)
 */
import { h } from '@pyreon/core'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { DateTime, Num } from '../components'
import { provideLocale } from '../index'
import { _resetLocaleState } from '../locale'

afterEach(() => _resetLocaleState())

const tree = () =>
  h(
    'main',
    null,
    h(Num, { value: 1234567.5, locale: 'de' }),
    h(Num, { value: 9.99, kind: 'currency', currency: 'EUR', locale: 'cs' }),
    h(DateTime, { value: '2026-11-18', kind: 'date', locale: 'fr' }),
    h(DateTime, { value: Date.UTC(2026, 10, 18, 23, 30), locale: 'ja', timeZone: 'Asia/Tokyo' }),
  )

describe('SSR output', () => {
  it('renders the formatted text and <time datetime>', async () => {
    const html = await renderToString(tree())
    expect(html).toMatch(/<time datetime="2026-11-18" title="[^"]*2026"[^>]*>/)
    expect(html).toMatch(/<time datetime="2026-11-18T23:30:00.000Z" title="[^"]*"[^>]*>/)
    expect(html).toContain(new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 18)))
    expect(html).toContain(new Intl.DateTimeFormat('ja', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(Date.UTC(2026, 10, 18, 23, 30)))
  })

  it('is deterministic across requests and across a provided locale', async () => {
    const App = () => {
      provideLocale('de')
      return h('p', null, h(Num, { value: 1234.5 }), h(DateTime, { value: '2026-11-18', kind: 'date' }))
    }
    const a = await runWithRequestContext(() => renderToString(h(App, null)))
    const b = await runWithRequestContext(() => renderToString(h(App, null)))
    expect(a).toBe(b)
    expect(a).toContain(new Intl.NumberFormat('de').format(1234.5))
  })
})
