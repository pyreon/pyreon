import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { gateChannels, openChannels, resolveSiteLink, SITE_LINKS, type SiteLinkKey } from '../src/site-links'
import type { StableLinkChannel } from '../src/site/content/types-site'

/**
 * The channel rule (`src/site-links.ts`) applied to the build.
 *
 * 1. Every site content file (`src/site/content/**.json`) passes through
 *    `gateChannels` as it is imported, so the pages, the nav, the footer and
 *    the sitemap rows never see a link to a channel that is not open,
 *    whichever loader reads them. It runs before the plugins that highlight
 *    code in the same files (`enforce: 'pre'`, listed first).
 *
 * 2. `/discord` and `/newsletter` are not routes. For each OPEN channel this
 *    plugin writes `dist/<channel>/index.html`, a static redirect to the
 *    channel's address that works with JavaScript off (`<meta refresh>`,
 *    canonical, `noindex`, a visible link), and the dev server answers the
 *    same path. A closed channel gets nothing, so its address is a plain 404
 *    and it is in no sitemap (the sitemap lists prerendered routes only).
 */
const CONTENT_JSON = /\/src\/site\/content\/.+\.json$/
const CHANNEL_COPY = (key: SiteLinkKey) => fileURLToPath(new URL(`../src/site/content/pages/channels/${key}.json`, import.meta.url))

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fill = (s: string, destination: string) => s.replace(/\{destination\}/g, destination)

/** The redirect page of an open channel. Exported for tests. */
export function redirectPage(copy: StableLinkChannel, target: string): string {
  const t = esc(target)
  const d = copy.destination
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(copy.meta.title)}</title>
<meta name="description" content="${esc(copy.meta.description)}">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${t}">
<link rel="canonical" href="${t}">
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<style>
:root{color-scheme:dark light;--bg:#0A0A0E;--text:#FFFCF5;--link:#22D3EE}
@media (prefers-color-scheme: light){:root{--bg:#FAF5EB;--text:#0A0A0E;--link:#0A6E89}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:18px/1.6 "Space Grotesk",system-ui,sans-serif}
main{max-width:640px;padding:24px 16px}
h1{font-size:clamp(28px,5vw,44px);line-height:1.1;margin:0 0 12px}
a{color:var(--link)}
</style>
</head>
<body>
<main>
<h1>${esc(fill(copy.redirect.title, d))}</h1>
<p>${esc(fill(copy.redirect.text, d))}</p>
<p><a href="${t}">${esc(fill(copy.redirect.cta, d))}</a></p>
</main>
<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script>
</body>
</html>
`
}

function redirects(links: Record<SiteLinkKey, string | null>): { key: SiteLinkKey; html: string }[] {
  return openChannels(links).map((key) => {
    const copy = JSON.parse(readFileSync(CHANNEL_COPY(key), 'utf8')) as StableLinkChannel
    return { key, html: redirectPage(copy, resolveSiteLink(key, links) as string) }
  })
}

export default function channelGate(links: Record<SiteLinkKey, string | null> = SITE_LINKS): Plugin {
  let serverBuild = false
  return {
    name: 'pyreon-docs-channel-gate',
    enforce: 'pre',

    configResolved(config) {
      // zero's SSG pass runs nested server builds with this plugin chain; only
      // the client build writes the site.
      serverBuild = Boolean(config.build.ssr)
    },

    transform(code, id) {
      const path = id.split('?')[0] ?? id
      if (!CONTENT_JSON.test(path)) return null
      let data: unknown
      try {
        data = JSON.parse(code)
      } catch (err) {
        throw new Error(`[Pyreon] site content ${path} is not valid JSON: ${(err as Error).message}`)
      }
      return { code: JSON.stringify(gateChannels(data, path.slice(path.indexOf('/src/site/content/') + 1), links)), map: null }
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split(/[?#]/)[0]?.replace(/\/$/, '')
        const hit = redirects(links).find((r) => path === `/${r.key}`)
        if (!hit) return next()
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(hit.html)
      })
    },

    generateBundle() {
      if (serverBuild) return
      for (const { key, html } of redirects(links)) this.emitFile({ type: 'asset', fileName: `${key}/index.html`, source: html })
    },
  }
}
