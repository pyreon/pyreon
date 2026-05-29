#!/usr/bin/env bun
/**
 * check-mcp-docs — assert every MCP tool registered in
 * `packages/tools/mcp/src/manifest.ts` has a `### <name>` section in
 * `docs/docs/mcp.md`.
 *
 * Closes the silent-drift footgun T2.5.12 was opened to fix: as new
 * MCP tools land, manifest entries drift ahead of the human-written
 * docs. By the time anyone notices, agents reading `mcp.md` see a
 * partial surface, and `mcp_overview` (which reads the manifest at
 * runtime) shows tools the docs don't describe.
 *
 * The gate is intentionally narrow: it only walks tool entries
 * (`signature` starts with `tool: `). Non-tool manifest entries
 * (types, helpers, exports) don't trigger the gate, so package-level
 * api[] additions stay friction-free.
 *
 * Run:
 *   bun run check-mcp-docs           # exit non-zero on drift
 *   bun run check-mcp-docs --json    # machine-readable
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')
const MANIFEST_PATH = join(REPO_ROOT, 'packages/tools/mcp/src/manifest.ts')
const DOCS_PATH = join(REPO_ROOT, 'docs/docs/mcp.md')

interface MissingEntry {
  tool: string
  signature: string
}

interface CheckResult {
  ok: boolean
  toolCount: number
  documented: string[]
  missing: MissingEntry[]
}

/**
 * Parse manifest.ts and extract every api[] entry whose `signature`
 * begins with `tool: ` — those are the live MCP tools. Done with a
 * source-text scan rather than dynamic import so the script stays
 * fast and doesn't pull in `@pyreon/manifest`'s zod runtime for a
 * one-shot drift check.
 */
function readManifestTools(): { name: string; signature: string }[] {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`[check-mcp-docs] manifest not found: ${MANIFEST_PATH}`)
  }
  const source = readFileSync(MANIFEST_PATH, 'utf8')

  // Match every `{ name: '<x>', kind: '...', signature: <quoted> }` block in
  // the api[] array. The signature line gates the entry — a tool entry's
  // signature always starts with `tool: `. Both single and double quotes
  // are valid in TS source (signatures with apostrophes use doubles), and
  // the value can sit on the same line OR on a continuation line. The `s`
  // flag lets `.` span newlines so the lookahead from `name` to
  // `signature` doesn't require single-line proximity.
  const tools: { name: string; signature: string }[] = []
  const entryRegex =
    /name:\s*'([a-z_][a-z0-9_]*)',\s*kind:\s*'[^']*',\s*signature:\s*['"]([^'"]+)['"]/gs
  for (const [, name, signature] of source.matchAll(entryRegex)) {
    if (name && signature && signature.startsWith('tool: ')) {
      tools.push({ name, signature })
    }
  }
  if (tools.length === 0) {
    throw new Error('[check-mcp-docs] no tool entries parsed from manifest — regex drifted')
  }
  return tools
}

/**
 * Scan docs/docs/mcp.md for `### <name>` headers, normalised to lowercase
 * for case-insensitive comparison. The hash count is matched on `### `
 * (h3) since every existing tool section uses h3.
 */
function readDocSections(): Set<string> {
  if (!existsSync(DOCS_PATH)) {
    throw new Error(`[check-mcp-docs] docs file not found: ${DOCS_PATH}`)
  }
  const source = readFileSync(DOCS_PATH, 'utf8')
  const headers = new Set<string>()
  const headerRegex = /^###\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/gm
  for (const [, name] of source.matchAll(headerRegex)) {
    if (name) headers.add(name.toLowerCase())
  }
  return headers
}

function check(): CheckResult {
  const tools = readManifestTools()
  const sections = readDocSections()

  const documented: string[] = []
  const missing: MissingEntry[] = []
  for (const tool of tools) {
    if (sections.has(tool.name.toLowerCase())) {
      documented.push(tool.name)
    } else {
      missing.push({ tool: tool.name, signature: tool.signature })
    }
  }

  return {
    ok: missing.length === 0,
    toolCount: tools.length,
    documented: documented.sort(),
    missing: missing.sort((a, b) => a.tool.localeCompare(b.tool)),
  }
}

function main(): void {
  const result = check()
  const json = process.argv.includes('--json')

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }

  if (result.ok) {
    console.log(
      `✓ MCP docs gate clean. ${result.toolCount} tool(s) registered, ` +
        `${result.documented.length} documented in docs/docs/mcp.md.`,
    )
    process.exit(0)
  }

  console.error('✗ MCP docs drift detected.')
  console.error('')
  console.error(
    `  ${result.missing.length} of ${result.toolCount} tool(s) lack a "### <name>" section in docs/docs/mcp.md:`,
  )
  console.error('')
  for (const entry of result.missing) {
    console.error(`    - ${entry.tool}  (${entry.signature})`)
  }
  console.error('')
  console.error(
    '  Add a section to docs/docs/mcp.md following the existing pattern (description + Parameters table + Example call).',
  )
  console.error('  See docs/docs/mcp.md "Tools by intent" navigator for the canonical ordering.')
  process.exit(1)
}

if (import.meta.main) {
  main()
}

export { check, readManifestTools, readDocSections }
