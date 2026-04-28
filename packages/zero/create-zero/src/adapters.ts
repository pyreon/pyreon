import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterId, ProjectConfig } from './templates'

/**
 * Per-adapter deploy-artefact generation. Each adapter's `apply` writes the
 * platform-specific config files (vercel.json, wrangler.toml, Dockerfile, …)
 * into the scaffolded project. The vite-config side (importing the right
 * `*Adapter()` factory from `@pyreon/zero/server`) is handled by
 * `generateViteConfig` in `scaffold.ts`.
 */
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

// ─── Vercel ─────────────────────────────────────────────────────────────────

const vercel: AdapterGen = {
  id: 'vercel',
  viteFactory: 'vercelAdapter',
  async apply(config) {
    await writeFile(
      join(config.targetDir, 'vercel.json'),
      JSON.stringify(
        {
          $schema: 'https://openapi.vercel.sh/vercel.json',
          buildCommand: 'bun run build',
          outputDirectory: 'dist',
          framework: null,
          // The zero adapter writes its own functions/ + edge config; we just
          // pin the build command and tell vercel not to autodetect.
        },
        null,
        2,
      ) + '\n',
    )
  },
  badge() {
    return '[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=)'
  },
  envKeys() {
    return []
  },
}

// ─── Cloudflare Pages ───────────────────────────────────────────────────────

const cloudflare: AdapterGen = {
  id: 'cloudflare',
  viteFactory: 'cloudflareAdapter',
  async apply(config) {
    const wranglerToml = `name = "${slug(config.name)}"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[vars]
# NODE_ENV = "production"
`
    await writeFile(join(config.targetDir, 'wrangler.toml'), wranglerToml)

    // _routes.json — tells Pages which paths are dynamic (handled by the
    // worker) vs static (served from CDN). The default below treats every
    // path as dynamic; tighten for prod.
    await writeFile(
      join(config.targetDir, '_routes.json'),
      JSON.stringify({ version: 1, include: ['/*'], exclude: ['/build/*'] }, null, 2) + '\n',
    )
  },
  badge() {
    return '[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=)'
  },
  envKeys() {
    return []
  },
}

// ─── Netlify ────────────────────────────────────────────────────────────────

const netlify: AdapterGen = {
  id: 'netlify',
  viteFactory: 'netlifyAdapter',
  async apply(config) {
    const netlifyToml = `[build]
  command = "bun run build"
  publish = "dist"

[functions]
  directory = "dist/.netlify/functions"
  node_bundler = "esbuild"

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/server/:splat"
  status = 200
  force = false
`
    await writeFile(join(config.targetDir, 'netlify.toml'), netlifyToml)
  },
  badge() {
    return '[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=)'
  },
  envKeys() {
    return []
  },
}

// ─── Node ───────────────────────────────────────────────────────────────────

const node: AdapterGen = {
  id: 'node',
  viteFactory: 'nodeAdapter',
  async apply(config) {
    const dockerfile = `FROM node:22-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN corepack enable && corepack prepare bun@latest --activate && bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]
`
    await writeFile(join(config.targetDir, 'Dockerfile'), dockerfile)
    await writeFile(
      join(config.targetDir, '.dockerignore'),
      'node_modules\ndist\n.git\n.env\n.env.*\n',
    )
  },
  badge() {
    return ''
  },
  envKeys() {
    return ['PORT']
  },
}

// ─── Bun ────────────────────────────────────────────────────────────────────

const bun: AdapterGen = {
  id: 'bun',
  viteFactory: 'bunAdapter',
  async apply(config) {
    const dockerfile = `FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "run", "dist/server.js"]
`
    await writeFile(join(config.targetDir, 'Dockerfile'), dockerfile)
    await writeFile(
      join(config.targetDir, '.dockerignore'),
      'node_modules\ndist\n.git\n.env\n.env.*\n',
    )
  },
  badge() {
    return ''
  },
  envKeys() {
    return ['PORT']
  },
}

// ─── Static (no server) ─────────────────────────────────────────────────────

const staticAdapter: AdapterGen = {
  id: 'static',
  // No vite-side adapter — `dist/` is the deployable artefact. Mode handles SSG.
  viteFactory: null,
  async apply() {
    // Intentional no-op: `dist/` after `bun run build` is the entire site.
  },
  badge() {
    return ''
  },
  envKeys() {
    return []
  },
}

// ─── Registry ───────────────────────────────────────────────────────────────

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
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
}
