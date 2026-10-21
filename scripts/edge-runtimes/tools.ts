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

/**
 * Packages whose platform binary arrives through an OPTIONAL dependency
 * (`@cloudflare/workerd-linux-64`, `-darwin-arm64`, …). npm treats a failed
 * optional fetch as non-fatal and drops it SILENTLY, so a transient registry
 * error leaves a complete-looking install whose runtime cannot start — the
 * suite then dies at web-server boot with `The package "@cloudflare/workerd-…"
 * could not be found`, far from the cause. Each package here throws at
 * `require` time when its binary is missing, which makes loading it a cheap
 * and exact probe.
 */
const BINARY_PROBES = ['workerd'] as const

/**
 * The binary-backed packages in `dir` that cannot load. Runs the probe under
 * `node`, the runtime wrangler itself uses — bun's own resolution could load
 * a package node cannot.
 */
export function missingRuntimeBinaries(dir: string, probes: readonly string[] = BINARY_PROBES): string[] {
  return probes.filter((pkg) => {
    try {
      execFileSync('node', ['-e', `require(${JSON.stringify(pkg)})`], { cwd: dir, stdio: 'pipe' })
      return false
    } catch {
      return true
    }
  })
}

function install(dir: string): void {
  const specs = Object.entries(EDGE_TOOL_VERSIONS).map(([pkg, v]) => `${pkg}@${v}`)
  console.log(`[edge-runtimes] installing ${specs.join(' ')} into ${dir}`)
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--save-exact', ...specs], { cwd: dir, stdio: 'inherit' })
}

/**
 * Install the pinned tools if any is missing, at the wrong version, or missing
 * its platform binary. Returns the tools dir. Checking only the top-level
 * versions is not enough: a cached install whose optional binary was dropped
 * passes that check forever, so the binaries are probed on every call too.
 */
export function ensureEdgeTools(): string {
  const dir = edgeToolsDir()
  const stale = Object.entries(EDGE_TOOL_VERSIONS).filter(([pkg, v]) => installedVersion(dir, pkg) !== v)
  if (stale.length === 0 && missingRuntimeBinaries(dir).length === 0) return dir
  mkdirSync(dir, { recursive: true })
  if (!existsSync(join(dir, 'package.json'))) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'pyreon-edge-tools', private: true }, null, 2))
  }
  // One retry: the dropped-optional case is a transient fetch failure, and a
  // second `npm install` fills in exactly what the lockfile says is missing.
  for (let attempt = 1; ; attempt++) {
    install(dir)
    const missing = missingRuntimeBinaries(dir)
    if (missing.length === 0) return dir
    if (attempt === 2) {
      throw new Error(
        `[edge-runtimes] ${missing.join(', ')} installed without its platform binary (${process.platform}-${process.arch}) ` +
          'after 2 attempts. npm skips an optional dependency it fails to fetch without failing the install; ' +
          `check registry access, or delete ${dir} and retry.`,
      )
    }
    console.warn(`[edge-runtimes] ${missing.join(', ')} is missing its platform binary — reinstalling once`)
  }
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
