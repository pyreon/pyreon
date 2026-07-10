/**
 * Scaffold ↔ adapter OUTPUT-PATH contract test.
 *
 * The deploy configs the scaffolder writes (Dockerfiles, `netlify.toml`,
 * `wrangler.toml`, `vercel.json`) must reference EXACTLY the paths the
 * `@pyreon/zero` deploy adapters stage into `dist/` — historically they
 * hardcoded their own guesses and drifted (the node/bun Dockerfiles ran
 * `dist/server.js`, a file NO adapter has ever emitted; `netlify.toml`
 * published `dist` with functions at `dist/.netlify/functions` and a
 * redirect to a function named `server`, while the adapter stages
 * `dist/publish` + `dist/netlify/functions` with a function named `ssr`
 * — every scaffolded node/bun/netlify deploy was broken from inception).
 *
 * This test imports the adapters' own output-path constants
 * (`*_ADAPTER_OUTPUT` from `@pyreon/zero/server` — the SAME values the
 * adapters build their staging paths from) and asserts each scaffolded
 * deploy config against them, by running each AdapterGen's real
 * `apply()` into a temp dir. Drift on either side fails here — the
 * `scripts/test-paths.ts` one-source lesson, adapted to the "the
 * scaffolder must not carry `@pyreon/zero` as a runtime dependency"
 * constraint (the constants are a devDependency import; the generators
 * keep literals that this test pins).
 *
 * NOTE: the values encode the plugin-owned `zero build` layout (client
 * bundle + adapter artifacts at `dist/`, PR #2155) — the `zero build`
 * CLI delegates the whole pipeline to the zero plugin, whose adapters
 * stage into the one `dist/` tree.
 */
import {
  BUN_ADAPTER_OUTPUT,
  CLOUDFLARE_ADAPTER_OUTPUT,
  NETLIFY_ADAPTER_OUTPUT,
  NODE_ADAPTER_OUTPUT,
  VERCEL_ADAPTER_OUTPUT,
} from '@pyreon/zero/server'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { adapterFor } from '../adapters'
import type { ProjectConfig, RenderMode } from '../templates'

const dirs: string[] = []
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cz-adapter-contract-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function cfg(adapter: ProjectConfig['adapter'], renderMode: RenderMode): ProjectConfig {
  return {
    name: 'contract-app',
    targetDir: freshDir(),
    template: 'app',
    renderMode,
    adapter,
    features: [],
    packageStrategy: 'meta',
    integrations: [],
    aiTools: [],
    compat: 'none',
    lint: false,
    typedRoutes: false,
  }
}

describe('node adapter — Dockerfile runs the adapter-emitted runner', () => {
  it(`CMD runs dist/${NODE_ADAPTER_OUTPUT.runnerEntry} (the node adapter's emitted entry)`, async () => {
    const config = cfg('node', 'ssr-stream')
    await adapterFor('node').apply(config)
    const dockerfile = readFileSync(join(config.targetDir, 'Dockerfile'), 'utf8')
    expect(dockerfile).toContain(`CMD ["node", "dist/${NODE_ADAPTER_OUTPUT.runnerEntry}"]`)
    // The historical drift: dist/server.js was never emitted by any adapter.
    expect(dockerfile).not.toContain('dist/server.js')
  })

  it('SPA mode emits NO Dockerfile (no adapter runs → no dist/index.js to run)', async () => {
    // The node adapter's Dockerfile CMD runs `dist/index.js`, which is only
    // emitted when `adapter.build()` runs — and it does NOT run in `spa`
    // mode (SPA ships a static client bundle only). A Dockerfile CMD'ing a
    // never-emitted entry would crash the container at startup, so we emit
    // none. Bisect: revert `serverRunnerApply` to `overlayApply` → the
    // Dockerfile reappears for spa and this fails.
    const config = cfg('node', 'spa')
    await adapterFor('node').apply(config)
    expect(existsSync(join(config.targetDir, 'Dockerfile'))).toBe(false)
    expect(existsSync(join(config.targetDir, '.dockerignore'))).toBe(false)
  })
})

describe('bun adapter — Dockerfile runs the adapter-emitted runner', () => {
  it(`CMD runs dist/${BUN_ADAPTER_OUTPUT.runnerEntry} (the bun adapter's emitted entry)`, async () => {
    const config = cfg('bun', 'ssr-stream')
    await adapterFor('bun').apply(config)
    const dockerfile = readFileSync(join(config.targetDir, 'Dockerfile'), 'utf8')
    expect(dockerfile).toContain(`CMD ["bun", "dist/${BUN_ADAPTER_OUTPUT.runnerEntry}"]`)
    expect(dockerfile).not.toContain('dist/server.js')
  })

  it('SPA mode emits NO Dockerfile (no adapter runs → no dist/index.ts to run)', async () => {
    const config = cfg('bun', 'spa')
    await adapterFor('bun').apply(config)
    expect(existsSync(join(config.targetDir, 'Dockerfile'))).toBe(false)
    expect(existsSync(join(config.targetDir, '.dockerignore'))).toBe(false)
  })
})

describe('netlify adapter — netlify.toml matches the staged output', () => {
  it('SSR modes publish the staged client + wire the ssr function', async () => {
    for (const mode of ['ssr-stream', 'ssr-string', 'isr'] as const) {
      const config = cfg('netlify', mode)
      await adapterFor('netlify').apply(config)
      const toml = readFileSync(join(config.targetDir, 'netlify.toml'), 'utf8')
      // Adapter stages the client into dist/<publishDir>.
      expect(toml).toContain(`publish = "dist/${NETLIFY_ADAPTER_OUTPUT.publishDir}"`)
      // Adapter stages the function into dist/<functionsDir>.
      expect(toml).toContain(`directory = "dist/${NETLIFY_ADAPTER_OUTPUT.functionsDir}"`)
      // Adapter's function file is <functionName>.mjs — the redirect must
      // target that name (the historical config targeted "server").
      expect(toml).toContain(`to = "/.netlify/functions/${NETLIFY_ADAPTER_OUTPUT.functionName}"`)
      expect(toml).not.toContain('/.netlify/functions/server')
      expect(toml).not.toContain('dist/.netlify')
    }
  })

  it('SSG publishes the prerendered dist root, with no function wiring', async () => {
    const config = cfg('netlify', 'ssg')
    await adapterFor('netlify').apply(config)
    const toml = readFileSync(join(config.targetDir, 'netlify.toml'), 'utf8')
    expect(toml).toContain('publish = "dist"')
    expect(toml).not.toContain('functions')
    expect(toml).not.toContain('redirects')
  })

  it('SPA publishes dist with the SPA fallback rewrite', async () => {
    const config = cfg('netlify', 'spa')
    await adapterFor('netlify').apply(config)
    const toml = readFileSync(join(config.targetDir, 'netlify.toml'), 'utf8')
    expect(toml).toContain('publish = "dist"')
    expect(toml).toContain('to = "/index.html"')
    expect(toml).not.toContain('functions')
  })
})

describe('cloudflare adapter — Pages reads adapter-owned files from dist', () => {
  it('wrangler.toml deploys the dist tree (where the adapter stages everything)', async () => {
    const config = cfg('cloudflare', 'ssr-stream')
    await adapterFor('cloudflare').apply(config)
    const wrangler = readFileSync(join(config.targetDir, 'wrangler.toml'), 'utf8')
    expect(wrangler).toContain('pages_build_output_dir = "dist"')
    expect(wrangler).toContain('nodejs_compat')
  })

  it(`does NOT scaffold a root ${CLOUDFLARE_ADAPTER_OUTPUT.routesFile} (the adapter writes the authoritative one into dist)`, async () => {
    // Cloudflare Pages reads `_routes.json` from the deploy OUTPUT dir
    // (`pages_build_output_dir`), never the repo root. The historical
    // scaffolded root copy was dead weight with misleading content
    // (`exclude: ["/build/*"]` — a path no zero app has).
    const config = cfg('cloudflare', 'ssr-stream')
    await adapterFor('cloudflare').apply(config)
    expect(existsSync(join(config.targetDir, CLOUDFLARE_ADAPTER_OUTPUT.routesFile))).toBe(false)
  })
})

describe('vercel adapter — vercel.json + root-level Build Output API', () => {
  it('outputDirectory is dist (the no-adapter / SPA fallback)', async () => {
    // RESOLVED (was a tracked limitation): the vercel adapter now stages
    // its Build Output API v3 tree at the PROJECT ROOT
    // (`<projectRoot>/${VERCEL_ADAPTER_OUTPUT.outputDir}`), which Vercel
    // auto-detects — so the SSR function IS reachable and dynamic routes no
    // longer 404. When the Build Output API tree is present (every SSR/SSG
    // build), Vercel deploys via it and IGNORES `outputDirectory`; the
    // `outputDirectory: "dist"` here is only the fallback for a build that
    // runs no adapter (SPA mode). It stays `"dist"` (unchanged scaffold).
    const config = cfg('vercel', 'ssr-stream')
    await adapterFor('vercel').apply(config)
    const vercelJson = JSON.parse(
      readFileSync(join(config.targetDir, 'vercel.json'), 'utf8'),
    ) as { outputDirectory?: string; framework?: unknown }
    expect(vercelJson.outputDirectory).toBe('dist')
    expect(vercelJson.framework).toBeNull()
  })
})
