#!/usr/bin/env node
/**
 * @pyreon/mcp — Model Context Protocol server for Pyreon
 *
 * Exposes tools that AI coding assistants (Claude Code, Cursor, etc.) can use
 * to generate, validate, and migrate Pyreon code.
 *
 * Tools:
 *   get_api                   — Look up any Pyreon API: signature, usage, common mistakes
 *   validate                  — Check a code snippet for Pyreon anti-patterns
 *   migrate_react             — Convert React code to idiomatic Pyreon
 *   diagnose                  — Parse an error message into structured fix information
 *   get_routes                — List all routes in the current project
 *   get_components            — List all components with their props and signals
 *   get_browser_smoke_status  — Report which browser-categorized packages have smoke coverage
 *
 * Usage:
 *   bunx @pyreon/mcp          # stdio transport (for IDE integration)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  detectPyreonPatterns,
  detectReactPatterns,
  diagnoseError,
  migrateReactCode,
} from '@pyreon/compiler'
import { z } from 'zod'
import packageJson from '../package.json' with { type: 'json' }
import { API_REFERENCE } from './api-reference'
import { generateContext, type ProjectContext } from './project-scanner'

// ═══════════════════════════════════════════════════════════════════════════════
// Server setup — exported as a factory so tests can stand up a server with an
// in-memory transport instead of stdio.
// ═══════════════════════════════════════════════════════════════════════════════

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'pyreon',
    version: packageJson.version,
  })

  // Project context cache is per-server-instance so the test server and the
  // prod server do not share state.
  let cachedContext: ProjectContext | null = null
  let contextCwd = process.cwd()

  function getContext(): ProjectContext {
    if (!cachedContext || contextCwd !== process.cwd()) {
      contextCwd = process.cwd()
      cachedContext = generateContext(contextCwd)
    }
    return cachedContext
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Tool: get_api
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
  'get_api',
  {
    package: z.string(),
    symbol: z.string(),
  },
  async ({ package: pkg, symbol }) => {
    const key = `${pkg}/${symbol}`
    const entry = API_REFERENCE[key]

    if (!entry) {
      const allKeys = Object.keys(API_REFERENCE)
      const suggestions = allKeys
        .filter((k) => k.toLowerCase().includes(symbol.toLowerCase()))
        .slice(0, 5)

      return textResult(
        `Symbol '${symbol}' not found in @pyreon/${pkg}.\n\n${
          suggestions.length > 0
            ? `Did you mean one of these?\n${suggestions.map((s) => `  - ${s}`).join('\n')}`
            : 'No similar symbols found.'
        }`,
      )
    }

    return textResult(
      `## @pyreon/${pkg} — ${symbol}\n\n**Signature:**\n\`\`\`typescript\n${entry.signature}\n\`\`\`\n\n**Usage:**\n\`\`\`typescript\n${entry.example}\n\`\`\`\n\n${entry.notes ? `**Notes:** ${entry.notes}\n\n` : ''}${entry.mistakes ? `**Common mistakes:**\n${entry.mistakes}\n` : ''}`,
    )
  },
)

// ═══════════════════════════════════════════════════════════════════════════════
// Tool: validate
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  'validate',
  {
    code: z.string(),
    filename: z.string().optional(),
  },
  async ({ code, filename }) => {
    // Run both detectors. The React detector flags "coming from React"
    // mistakes (useState, className, .value writes) — relevant when the
    // code has not yet committed to Pyreon. The Pyreon detector flags
    // "using Pyreon wrong" mistakes (missing <For by>, destructured
    // props, typeof-process dev gates) — relevant once the imports are
    // Pyreon. A single snippet may trigger both sets, so we merge.
    const fname = filename ?? 'snippet.tsx'
    const reactDiags = detectReactPatterns(code, fname)
    const pyreonDiags = detectPyreonPatterns(code, fname)

    if (reactDiags.length === 0 && pyreonDiags.length === 0) {
      return textResult('✓ No issues found. The code follows Pyreon patterns correctly.')
    }

    type Diag = {
      code: string
      message: string
      line: number
      column: number
      current: string
      suggested: string
      fixable: boolean
    }
    const merged: Diag[] = [...reactDiags, ...pyreonDiags]
    merged.sort((a, b) => a.line - b.line || a.column - b.column)

    const issueText = merged
      .map(
        (d, i) =>
          `${i + 1}. **${d.code}** (line ${d.line})\n   ${d.message}\n   Current: \`${d.current}\`\n   Fix: \`${d.suggested}\`\n   Auto-fixable: ${d.fixable ? 'yes' : 'no'}`,
      )
      .join('\n\n')

    return textResult(
      `Found ${merged.length} issue${merged.length === 1 ? '' : 's'}:\n\n${issueText}`,
    )
  },
)

// ═══════════════════════════════════════════════════════════════════════════════
// Tool: migrate_react
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  'migrate_react',
  {
    code: z.string(),
    filename: z.string().optional(),
  },
  async ({ code, filename }) => {
    const result = migrateReactCode(code, filename ?? 'component.tsx')

    const changeList = result.changes.map((c) => `- Line ${c.line}: ${c.description}`).join('\n')

    const remainingIssues = result.diagnostics.filter((d) => !d.fixable)
    const manualText =
      remainingIssues.length > 0
        ? `\n\n**Remaining issues (manual fix needed):**\n${remainingIssues.map((d) => `- Line ${d.line}: ${d.message}\n  Suggested: \`${d.suggested}\``).join('\n')}`
        : ''

    return textResult(
      `## Migrated Code\n\n\`\`\`tsx\n${result.code}\n\`\`\`\n\n**Changes applied (${result.changes.length}):**\n${changeList || 'No changes needed.'}${manualText}`,
    )
  },
)

// ═══════════════════════════════════════════════════════════════════════════════
// Tool: diagnose
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  'diagnose',
  {
    error: z.string(),
  },
  async ({ error }) => {
    const diagnosis = diagnoseError(error)

    if (!diagnosis) {
      return textResult(
        `Could not identify a Pyreon-specific pattern in this error.\n\nError: ${error}\n\nSuggestions:\n- Check for typos in variable/function names\n- Verify all imports are correct\n- Run \`bun run typecheck\` for full TypeScript diagnostics\n- Run \`pyreon doctor\` for project-wide health check`,
      )
    }

    let text = `**Cause:** ${diagnosis.cause}\n\n**Fix:** ${diagnosis.fix}`
    if (diagnosis.fixCode) {
      text += `\n\n**Code:**\n\`\`\`typescript\n${diagnosis.fixCode}\n\`\`\``
    }
    if (diagnosis.related) {
      text += `\n\n**Related:** ${diagnosis.related}`
    }

    return textResult(text)
  },
)

// ═══════════════════════════════════════════════════════════════════════════════
// Tool: get_routes
// ═══════════════════════════════════════════════════════════════════════════════

server.tool('get_routes', {}, async () => {
  const ctx = getContext()

  if (ctx.routes.length === 0) {
    return textResult(
      'No routes detected. Routes are defined via createRouter() or a routes array.',
    )
  }

  const routeTable = ctx.routes
    .map((r) => {
      const flags = [
        r.hasLoader ? 'loader' : '',
        r.hasGuard ? 'guard' : '',
        r.params.length > 0 ? `params: ${r.params.join(', ')}` : '',
        r.name ? `name: "${r.name}"` : '',
      ]
        .filter(Boolean)
        .join(', ')

      return `  ${r.path}${flags ? ` (${flags})` : ''}`
    })
    .join('\n')

  return textResult(`**Routes (${ctx.routes.length}):**\n\n${routeTable}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// Tool: get_components
// ═══════════════════════════════════════════════════════════════════════════════

server.tool('get_components', {}, async () => {
  const ctx = getContext()

  if (ctx.components.length === 0) {
    return textResult('No components detected.')
  }

  const compList = ctx.components
    .map((c) => {
      const details = [
        c.props.length > 0 ? `props: { ${c.props.join(', ')} }` : '',
        c.hasSignals ? `signals: [${c.signalNames.join(', ')}]` : '',
      ]
        .filter(Boolean)
        .join(', ')

      return `  ${c.name} — ${c.file}${details ? `\n    ${details}` : ''}`
    })
    .join('\n')

  return textResult(`**Components (${ctx.components.length}):**\n\n${compList}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// Tool: get_browser_smoke_status
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  'get_browser_smoke_status',
  {},
  async () => {
    // Walks the current project, reports which browser-categorized
    // packages have at least one `*.browser.test.{ts,tsx}` file.
    // Mirrors `pyreon/require-browser-smoke-test` / the CI script so an
    // AI agent can check coverage before editing without running lint.
    const fs = await import('node:fs')
    const path = await import('node:path')

    const cwd = process.cwd()

    // Discover the browser-packages list by walking up from cwd.
    let browserPackages: string[] = []
    {
      let dir = cwd
      for (let i = 0; i < 30; i++) {
        const candidate = path.join(dir, '.claude', 'rules', 'browser-packages.json')
        if (fs.existsSync(candidate)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
              packages?: unknown
            }
            if (Array.isArray(parsed.packages)) {
              browserPackages = parsed.packages.filter((p): p is string => typeof p === 'string')
            }
          } catch {
            // fall through to empty list
          }
          break
        }
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    }

    if (browserPackages.length === 0) {
      return textResult(
        'No `.claude/rules/browser-packages.json` found in the current project. ' +
          'This tool reports browser-smoke coverage for Pyreon monorepos that ship ' +
          'the single-source-of-truth list. Consumer apps can still opt in via the ' +
          "lint rule's `additionalPackages` option.",
      )
    }

    function hasBrowserTest(dir: string): boolean {
      let entries: string[]
      try {
        entries = fs.readdirSync(dir)
      } catch {
        return false
      }
      for (const name of entries) {
        if (
          name.startsWith('.') ||
          name === 'node_modules' ||
          name === 'lib' ||
          name === 'dist'
        ) {
          continue
        }
        const full = path.join(dir, name)
        let isDir = false
        try {
          isDir = fs.statSync(full).isDirectory()
        } catch {
          continue
        }
        if (isDir) {
          if (hasBrowserTest(full)) return true
          continue
        }
        if (/\.browser\.test\.(?:ts|tsx)$/.test(name)) return true
      }
      return false
    }

    // Find each browser-categorized package's directory by matching
    // package.json `name` under packages/*.
    const pkgDirs = new Map<string, string>() // name -> dir
    function walkPkgs(dir: string, depth = 0): void {
      if (depth > 4) return
      let entries: string[]
      try {
        entries = fs.readdirSync(dir)
      } catch {
        return
      }
      for (const name of entries) {
        if (name.startsWith('.') || name === 'node_modules') continue
        const full = path.join(dir, name)
        let isDir = false
        try {
          isDir = fs.statSync(full).isDirectory()
        } catch {
          continue
        }
        if (!isDir) continue
        const pkgJsonPath = path.join(full, 'package.json')
        if (fs.existsSync(pkgJsonPath)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
              name?: unknown
            }
            if (typeof parsed.name === 'string') {
              pkgDirs.set(parsed.name, full)
            }
          } catch {
            // ignore malformed package.json
          }
        } else {
          walkPkgs(full, depth + 1)
        }
      }
    }
    // Project root = cwd or the ancestor with browser-packages.json.
    walkPkgs(path.join(cwd, 'packages'))

    const covered: string[] = []
    const missing: string[] = []
    const unknown: string[] = []
    for (const name of browserPackages) {
      const dir = pkgDirs.get(name)
      if (!dir) {
        unknown.push(name)
        continue
      }
      if (hasBrowserTest(dir)) covered.push(name)
      else missing.push(name)
    }

    const parts: string[] = []
    parts.push(`**Browser smoke coverage** (${covered.length} / ${browserPackages.length}):`)
    parts.push('')
    if (covered.length > 0) {
      parts.push(`✓ Covered (${covered.length}):`)
      for (const n of covered) parts.push(`  - ${n}`)
      parts.push('')
    }
    if (missing.length > 0) {
      parts.push(`✗ Missing \`*.browser.test.*\` (${missing.length}):`)
      for (const n of missing) parts.push(`  - ${n}`)
      parts.push('')
      parts.push(
        'Add a `*.browser.test.{ts,tsx}` file under `src/` in each missing package. ' +
          'See `.claude/rules/test-environment-parity.md` for the setup recipe.',
      )
    }
    if (unknown.length > 0) {
      parts.push(`? Listed in browser-packages.json but not found in this repo (${unknown.length}):`)
      for (const n of unknown) parts.push(`  - ${n}`)
    }
    return textResult(parts.join('\n'))
  },
)

  return server
}

// ═══════════════════════════════════════════════════════════════════════════════
// Start server (stdio transport) when invoked directly as a binary.
// Imports for tests do NOT auto-start — the integration test in
// `tests/validate.test.ts` wires up an in-memory transport instead.
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// `import.meta.main` is Bun's "entry module" flag. The compiled Node bin
// (via bun build) preserves this — the bunx / tsx invocation of the
// shebang sets it truthy; `import { createServer } from '...'` does not.
// Covers both "run as CLI" and "imported by a test" without needing
// require.main shims.
if (import.meta.main) {
  main().catch((err) => {
    console.error('MCP server error:', err)
    process.exit(1)
  })
}
