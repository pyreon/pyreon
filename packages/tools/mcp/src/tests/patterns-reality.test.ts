import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadPatternRegistry } from '../patterns'
import { type McpTestClient, newClient } from './helpers'

// Reality check for the bundled pattern corpus (issue #3785).
//
// `get_pattern` serves `docs/src/content/docs/patterns/*.md` verbatim — and
// the published tarball ships a SNAPSHOT of those files. The released 0.52.0
// guide told agents to import `@pyreon/charts/plot` (a subpath that no longer
// exists), to avoid `@pyreon/query` entirely, and to call a `get_api` shape
// the server does not accept. Nothing compared the prose with the packages or
// the tool registry, so the content rotted silently while every structural
// test stayed green.
//
// This suite cross-references every pattern against the three things it makes
// claims about:
//   (1) every `@pyreon/<pkg>` it names is a real workspace package,
//   (2) every `@pyreon/<pkg>/<subpath>` it names is in that package's
//       `exports` map (what a consumer can actually import),
//   (3) every MCP tool it names is registered on the real server.

const HERE = dirname(fileURLToPath(import.meta.url))
// tests/ → src/ → mcp/ → tools/ → packages/ → repo root
const REPO_ROOT = resolve(HERE, '../../../../../')

interface WorkspacePkg {
  name: string
  exports: Record<string, unknown> | null
}

function loadWorkspacePackages(): Map<string, WorkspacePkg> {
  const out = new Map<string, WorkspacePkg>()
  const packagesDir = join(REPO_ROOT, 'packages')
  for (const category of readdirSync(packagesDir)) {
    let entries: string[]
    try {
      entries = readdirSync(join(packagesDir, category))
    } catch {
      continue
    }
    for (const dir of entries) {
      try {
        const json = JSON.parse(readFileSync(join(packagesDir, category, dir, 'package.json'), 'utf8'))
        if (typeof json.name === 'string') {
          out.set(json.name, { name: json.name, exports: json.exports ?? null })
        }
      } catch {
        // not a package directory
      }
    }
  }
  return out
}

/** Strip fenced + inline code is NOT done on purpose — imports live IN code. */
function pyreonReferences(body: string): Array<{ pkg: string; sub: string | null }> {
  const refs: Array<{ pkg: string; sub: string | null }> = []
  // `@pyreon/name` optionally followed by `/subpath[/more]`. Trailing `-` or
  // `*` (glob prose like `@pyreon/native-*`) is skipped by the lookahead.
  const rx = /@pyreon\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\/([A-Za-z][A-Za-z0-9/_-]*))?(?![\w*-])/g
  for (const m of body.matchAll(rx)) {
    refs.push({ pkg: `@pyreon/${m[1]}`, sub: m[2] ?? null })
  }
  return refs
}

const registry = loadPatternRegistry(REPO_ROOT)
const workspace = loadWorkspacePackages()

describe('patterns reality — package names and subpaths exist', () => {
  it('discovers the corpus and the workspace (guards against a vacuous pass)', () => {
    expect(registry.patterns.length).toBeGreaterThan(10)
    expect(workspace.has('@pyreon/core')).toBe(true)
    expect(workspace.has('@pyreon/charts')).toBe(true)
  })

  it('every `@pyreon/<pkg>` a pattern names is a real workspace package', () => {
    const missing: Array<{ pattern: string; pkg: string }> = []
    for (const p of registry.patterns) {
      const seen = new Set<string>()
      for (const { pkg } of pyreonReferences(readFileSync(p.path, 'utf8'))) {
        if (!workspace.has(pkg) && !seen.has(pkg)) {
          seen.add(pkg)
          missing.push({ pattern: p.name, pkg })
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('every `@pyreon/<pkg>/<subpath>` a pattern names is in that package\'s `exports`', () => {
    const bad: Array<{ pattern: string; ref: string }> = []
    for (const p of registry.patterns) {
      for (const { pkg, sub } of pyreonReferences(readFileSync(p.path, 'utf8'))) {
        if (!sub) continue
        const info = workspace.get(pkg)
        if (!info) continue // reported by the previous spec
        const keys = Object.keys(info.exports ?? {})
        const key = `./${sub}`
        const ok = keys.some(
          (k) =>
            k === key ||
            (k.endsWith('/*') && key.startsWith(k.slice(0, -1))) ||
            (k.includes('*') && new RegExp(`^${k.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(key)),
        )
        if (!ok) bad.push({ pattern: p.name, ref: `${pkg}/${sub}` })
      }
    }
    // A hit means the pattern tells a consumer to import a subpath the
    // package does not export (the removed `@pyreon/charts/plot` shape), or
    // spells a per-symbol `get_api` key as if it were a module path.
    expect(bad).toEqual([])
  })
})

describe('patterns reality — MCP tool names exist on the real server', () => {
  let mcp: McpTestClient
  let toolNames: Set<string>

  beforeAll(async () => {
    mcp = await newClient()
    toolNames = new Set((await mcp.client.listTools()).tools.map((t) => t.name))
  })
  afterAll(async () => {
    await mcp.close()
  })

  it('the server registers the tools the corpus relies on (non-vacuous)', () => {
    for (const t of ['get_api', 'get_pattern', 'validate', 'diagnose']) {
      expect(toolNames.has(t)).toBe(true)
    }
  })

  it('every tool a pattern names (snake_case or `validate(`/`diagnose(` calls) is registered', () => {
    const bad: Array<{ pattern: string; tool: string }> = []
    for (const p of registry.patterns) {
      const body = readFileSync(p.path, 'utf8')
      const named = new Set<string>()
      for (const m of body.matchAll(/\b((?:get|audit|explain|migrate)_[a-z][a-z_]*|mcp_overview)\b/g)) {
        named.add(m[1]!)
      }
      for (const m of body.matchAll(/\b(validate|diagnose)\(\s*\{/g)) named.add(m[1]!)
      for (const tool of named) {
        if (!toolNames.has(tool)) bad.push({ pattern: p.name, tool })
      }
    }
    expect(bad).toEqual([])
  })

  it('every `get_api({ … })` call a pattern shows uses the real input shape { package, symbol }', () => {
    const bad: Array<{ pattern: string; call: string }> = []
    for (const p of registry.patterns) {
      const body = readFileSync(p.path, 'utf8')
      for (const m of body.matchAll(/get_api\(\{([^}]*)\}\)/g)) {
        const inner = m[1]!
        if (!/\bpackage:/.test(inner) || !/\bsymbol:/.test(inner)) {
          bad.push({ pattern: p.name, call: m[0] })
        }
      }
    }
    expect(bad).toEqual([])
  })
})
