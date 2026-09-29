/**
 * The real edge runtimes the `edge-runtimes` e2e suite runs zero's emitted
 * deploy artifacts in. Pinned, and installed OUTSIDE the workspace lockfile:
 * workerd alone is ~100 MB, and every other suite and developer would pay for
 * it on `bun install`. The suite installs them on first use instead.
 *
 * Location: `$PYREON_EDGE_TOOLS_DIR`, else `node_modules/.cache/pyreon-edge-tools`
 * (git-ignored, reused across runs — the install is skipped when the pinned
 * versions are already present).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const EDGE_TOOL_VERSIONS = {
  /** Cloudflare Pages/Workers — `wrangler pages dev` runs the worker in workerd. */
  wrangler: '4.143.0',
  /** Deno — the runtime of denoAdapter AND of Netlify Edge Functions. */
  deno: '2.9.6',
  /** Vercel's Edge Runtime (the sandbox `vercel dev` / Next.js use for edge code). */
  'edge-runtime': '4.0.1',
} as const

const REPO_ROOT = resolve(import.meta.dirname, '../..')

export function edgeToolsDir(): string {
  return process.env.PYREON_EDGE_TOOLS_DIR ?? join(REPO_ROOT, 'node_modules/.cache/pyreon-edge-tools')
}

function installedVersion(dir: string, pkg: string): string | undefined {
  try {
    return (JSON.parse(readFileSync(join(dir, 'node_modules', pkg, 'package.json'), 'utf8')) as { version: string })
      .version
  } catch {
    return undefined
  }
}

/** Install the pinned tools if any is missing or at the wrong version. Returns the tools dir. */
export function ensureEdgeTools(): string {
  const dir = edgeToolsDir()
  const stale = Object.entries(EDGE_TOOL_VERSIONS).filter(([pkg, v]) => installedVersion(dir, pkg) !== v)
  if (stale.length === 0) return dir
  mkdirSync(dir, { recursive: true })
  if (!existsSync(join(dir, 'package.json'))) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'pyreon-edge-tools', private: true }, null, 2))
  }
  const specs = Object.entries(EDGE_TOOL_VERSIONS).map(([pkg, v]) => `${pkg}@${v}`)
  console.log(`[edge-runtimes] installing ${specs.join(' ')} into ${dir}`)
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--save-exact', ...specs], { cwd: dir, stdio: 'inherit' })
  return dir
}

/** Absolute path of a tool's bin inside the tools dir. */
export function edgeToolBin(name: 'wrangler' | 'deno' | 'edge-runtime'): string {
  return join(edgeToolsDir(), 'node_modules', '.bin', name)
}

/** Resolve a module from the tools dir (for in-process use, e.g. `edge-runtime`). */
export function edgeToolModule(pkg: string): string {
  return join(edgeToolsDir(), 'node_modules', pkg)
}

if (import.meta.main) ensureEdgeTools()
