/**
 * W19 from kanban audit — Zero vite-plugin auto-injects the client
 * entry script before `<!--pyreon-scripts-->` so users don't have to
 * manually add `<script type="module" src="/src/entry-client.ts">` to
 * their `index.html`.
 */
import { describe, expect, it } from 'vitest'
import { zeroPlugin } from '../vite-plugin'

type IndexHtmlHandler = (
  html: string,
  ctx?: unknown,
) => string | undefined | null

function getTransform(plugin: ReturnType<typeof zeroPlugin>[number]) {
  const t = plugin.transformIndexHtml as
    | IndexHtmlHandler
    | { handler: IndexHtmlHandler }
  return typeof t === 'function' ? t : t.handler
}

describe('W19 — auto-inject entry-client script', () => {
  it('injects script tag before <!--pyreon-scripts--> in dev/spa mode', () => {
    const [mainPlugin] = zeroPlugin({ mode: 'spa' })
    const transform = getTransform(mainPlugin!)
    const html =
      '<html><body><div id="app"><!--pyreon-app--></div><!--pyreon-scripts--></body></html>'
    const result = transform(html, undefined)
    expect(result).toContain('<script type="module" src="/src/entry-client.ts">')
    // Placeholder still present so renderSsr can replace it with loader data
    expect(result).toContain('<!--pyreon-scripts-->')
    // Script comes BEFORE the placeholder so loader data executes after
    const scriptIdx = (result as string).indexOf('<script type="module"')
    const placeholderIdx = (result as string).indexOf('<!--pyreon-scripts-->')
    expect(scriptIdx).toBeLessThan(placeholderIdx)
  })

  it('respects custom entryClient path', () => {
    const [mainPlugin] = zeroPlugin({ entryClient: '/src/main.ts' })
    const transform = getTransform(mainPlugin!)
    const html = '<html><body><!--pyreon-scripts--></body></html>'
    const result = transform(html, undefined)
    expect(result).toContain('<script type="module" src="/src/main.ts">')
  })

  it('skips when entryClient is false (explicit opt-out)', () => {
    const [mainPlugin] = zeroPlugin({ entryClient: false })
    const transform = getTransform(mainPlugin!)
    const html = '<html><body><!--pyreon-scripts--></body></html>'
    const result = transform(html, undefined)
    expect(result).not.toContain('<script type="module"')
  })

  it('skips when html already references the entry-client script', () => {
    const [mainPlugin] = zeroPlugin({})
    const transform = getTransform(mainPlugin!)
    const html =
      '<html><body><script type="module" src="/src/entry-client.ts"></script><!--pyreon-scripts--></body></html>'
    const result = transform(html, undefined)
    // Only one script tag — no duplicate injection
    const matches = (result as string).match(
      /src="\/src\/entry-client\.ts"/g,
    )
    expect(matches?.length).toBe(1)
  })

  it('no-op when the html has no <!--pyreon-scripts--> placeholder', () => {
    const [mainPlugin] = zeroPlugin({})
    const transform = getTransform(mainPlugin!)
    const html = '<html><body>nothing pyreon-shaped</body></html>'
    const result = transform(html, undefined)
    expect(result).toBe(html)
  })
})

describe('dev error overlay module injection', () => {
  const html = '<html><head></head><body><!--pyreon-scripts--></body></html>'
  const devCtx = { server: {}, path: '/', filename: 'index.html' }

  it('the dev server gets the overlay module in <head>, before the entry', () => {
    const [mainPlugin] = zeroPlugin({ mode: 'ssr' })
    const result = getTransform(mainPlugin!)(html, devCtx) as unknown as {
      html: string
      tags: Array<{ tag: string; attrs: Record<string, string>; injectTo: string }>
    }
    expect(result.html).toContain('<script type="module" src="/src/entry-client.ts">')
    expect(result.tags).toEqual([
      {
        tag: 'script',
        attrs: { type: 'module', src: '/@id/__x00__virtual:zero/dev-overlay' },
        injectTo: 'head',
      },
    ])
  })

  it('a build never gets it (no dev server in the context)', () => {
    const [mainPlugin] = zeroPlugin({ mode: 'ssr' })
    const result = getTransform(mainPlugin!)(html, { path: '/', filename: 'index.html' })
    expect(typeof result).toBe('string')
    expect(result).not.toContain('dev-overlay')
  })

  it('an all-SPA app has no hydration to watch, so it is not injected there either', () => {
    const [mainPlugin] = zeroPlugin({ mode: 'spa' })
    const result = getTransform(mainPlugin!)(html, devCtx)
    expect(typeof result).toBe('string')
    expect(result).not.toContain('dev-overlay')
  })
})
