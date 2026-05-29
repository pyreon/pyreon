/**
 * Deployment-adapter application. Per-adapter files (vercel.json,
 * wrangler.toml, Dockerfile, ...) live in
 * `templates/_shared/_adapters/<adapter>/` as REAL files — the scaffolder
 * copies the overlay. Each adapter still declares its vite-side factory
 * (used by `generateViteConfig`), README badge markdown, and env-var
 * keys here.
 */

import { join, resolve } from 'node:path'
import { copyOverlay } from './template-engine'
import type { AdapterId, ProjectConfig } from './templates'

const SHARED_ADAPTERS_ROOT = resolve(import.meta.dirname, '..', 'templates', '_shared', '_adapters')

export interface AdapterGen {
  id: AdapterId
  /** Source-side import name from `@pyreon/zero/server`. */
  viteFactory: string | null
  /** Write all platform-specific files into `targetDir`. */
  apply(config: ProjectConfig): Promise<void>
  /** README badge markdown — empty string if the adapter has no one-click. */
  badge(config: ProjectConfig): string
  /** Env-var keys the user needs to set in the platform's dashboard. */
  envKeys(config: ProjectConfig): string[]
}

function overlayApply(adapter: AdapterId) {
  return async (config: ProjectConfig): Promise<void> => {
    const overlayDir = join(SHARED_ADAPTERS_ROOT, adapter)
    // Most adapters have no placeholders; cloudflare's wrangler.toml uses
    // {{slug}}. Pass the slug always — unused placeholders no-op.
    await copyOverlay(overlayDir, config.targetDir, { slug: slug(config.name) })
  }
}

const vercel: AdapterGen = {
  id: 'vercel',
  viteFactory: 'vercelAdapter',
  apply: overlayApply('vercel'),
  badge() {
    return '[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=)'
  },
  envKeys() {
    return []
  },
}

const cloudflare: AdapterGen = {
  id: 'cloudflare',
  viteFactory: 'cloudflareAdapter',
  apply: overlayApply('cloudflare'),
  badge() {
    return '[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=)'
  },
  envKeys() {
    return []
  },
}

const netlify: AdapterGen = {
  id: 'netlify',
  viteFactory: 'netlifyAdapter',
  apply: overlayApply('netlify'),
  badge() {
    return '[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=)'
  },
  envKeys() {
    return []
  },
}

const node: AdapterGen = {
  id: 'node',
  viteFactory: 'nodeAdapter',
  apply: overlayApply('node'),
  badge() {
    return ''
  },
  envKeys() {
    return ['PORT']
  },
}

const bun: AdapterGen = {
  id: 'bun',
  viteFactory: 'bunAdapter',
  apply: overlayApply('bun'),
  badge() {
    return ''
  },
  envKeys() {
    return ['PORT']
  },
}

const staticAdapter: AdapterGen = {
  id: 'static',
  viteFactory: null,
  async apply() {
    // Intentional no-op: `dist/` after `bun run build` is the entire site.
    // No platform files to copy.
  },
  badge() {
    return ''
  },
  envKeys() {
    return []
  },
}

export const ADAPTERS: Record<AdapterId, AdapterGen> = {
  vercel,
  cloudflare,
  netlify,
  node,
  bun,
  static: staticAdapter,
}

export function adapterFor(id: AdapterId): AdapterGen {
  return ADAPTERS[id]
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
}
