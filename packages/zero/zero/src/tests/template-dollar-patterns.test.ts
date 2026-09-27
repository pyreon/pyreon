/**
 * `$`-replacement-pattern corruption in template injection.
 *
 * `String.prototype.replace(literal, string)` still interprets `$$`, `$&`,
 * `` $` ``, `$'` in the REPLACEMENT. Rendered pages, head tags and loader
 * JSON contain them routinely, so both the build-time injector (SSG / 404 /
 * SPA-shell) and the dev SSR path must insert payloads verbatim.
 */
import { injectIntoTemplate } from '../ssr-build-shared'
import { fillDevTemplate } from '../vite-plugin'

const TPL =
  '<html><head><!--pyreon-head--></head><body><!--pyreon-app--><!--pyreon-scripts--></body></html>'

const result = {
  head: `<meta name="description" content="save $$ now $&">`,
  appHtml: `<p>cost $$5 and $' tail</p><code>a.replace(/x/, '$\`')</code>`,
  loaderScript: `<script>window.__PYREON_LOADER_DATA__={"price":"$$9","re":"$1$&"}</script>`,
}

const expected =
  `<html><head>${result.head}</head><body>${result.appHtml}${result.loaderScript}</body></html>`

describe('template injection preserves `$` sequences verbatim', () => {
  it('injectIntoTemplate (build path)', () => {
    expect(injectIntoTemplate(TPL, result)).toBe(expected)
  })

  it('injectIntoTemplate fallback paths (no placeholders)', () => {
    const html = injectIntoTemplate('<html><head></head><body><div id="app"></div></body></html>', result)
    expect(html).toContain(`${result.head}</head>`)
    expect(html).toContain(`<div id="app">${result.appHtml}</div>`)
    expect(html).toContain(`${result.loaderScript}</body>`)
  })

  it('fillDevTemplate (dev SSR path)', () => {
    expect(fillDevTemplate(TPL, result)).toBe(expected)
  })
})
