/**
 * `vite.config.ts` generator for scaffolded projects. Kept runtime-built
 * (not a template file with placeholders) because the plugins array is
 * GENUINELY computed — mode + adapter + compat shim all contribute. A
 * `{{plugins}}` placeholder in a template file would just hide this same
 * computation behind a marker.
 */

import { ADAPTERS } from '../adapters'
import type { ProjectConfig } from '../templates'

const MODE_MAP: Record<ProjectConfig['renderMode'], string> = {
  'ssr-stream': `mode: 'ssr', ssr: { mode: 'stream' }`,
  'ssr-string': `mode: 'ssr'`,
  ssg: `mode: 'ssg'`,
  spa: `mode: 'spa'`,
}

export function generateViteConfig(config: ProjectConfig): string {
  const pyreonOpts = config.compat !== 'none' ? `{ compat: '${config.compat}' }` : ''

  // Adapter wiring — `static` has no factory (dist/ IS the artefact).
  const adapter = ADAPTERS[config.adapter]
  const adapterImport = adapter.viteFactory
    ? `\nimport { ${adapter.viteFactory} } from '@pyreon/zero/server'`
    : ''
  const adapterArg = adapter.viteFactory ? `, adapter: ${adapter.viteFactory}()` : ''

  return `import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'${adapterImport}

// One config surface: fonts, SEO, favicons, og-images, and AI discoverability
// are all fields on zero() — no separate plugin imports needed.
export default {
  plugins: [
    pyreon(${pyreonOpts}),
    zero({
      ${MODE_MAP[config.renderMode]}${adapterArg},

      // Google Fonts — self-hosted at build time (CDN in dev), preloaded,
      // with auto size-adjusted fallbacks that eliminate font-swap CLS
      // (use \`font-family: var(--pyreon-font-inter)\` in your CSS/theme).
      font: {
        google: ['Inter:wght@400;500;600;700;800', 'JetBrains Mono:wght@400'],
        subsets: ['latin'],
        fallbackAdjust: true,
      },

      // sitemap.xml + robots.txt at build time — set your real origin once.
      seo: {
        sitemap: { origin: 'https://example.com' },
        robots: {
          rules: [{ userAgent: '*', allow: ['/'] }],
          sitemap: 'https://example.com/sitemap.xml',
        },
      },
    }),
  ],
}
`
}
