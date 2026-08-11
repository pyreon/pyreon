#!/usr/bin/env bun
/**
 * check-mcp-docs — assert every MCP tool registered in
 * `packages/tools/mcp/src/manifest.ts` has a `### <name>` section in
 * `docs/src/content/docs/mcp.md`.
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

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')
const MANIFEST_PATH = join(REPO_ROOT, 'packages/tools/mcp/src/manifest.ts')
const DOCS_PATH = join(REPO_ROOT, 'docs/src/content/docs/mcp.md')

interface MissingEntry {
  tool: string
  signature: string
}

interface CheckResult {
  ok: boolean
  toolCount: number
  /** Manifest-bearing packages `get_api` cannot answer for. */
  unreachable: string[]
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
 * Scan docs/src/content/docs/mcp.md for `### <name>` headers, normalised to lowercase
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
  const unreachable = findUnreachablePackages()

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
    ok: missing.length === 0 && unreachable.length === 0,
    toolCount: tools.length,
    documented: documented.sort(),
    missing: missing.sort((a, b) => a.tool.localeCompare(b.tool)),
    unreachable,
  }
}

/**
 * Packages with a manifest that `get_api` cannot answer for.
 *
 * A manifest is the docs pipeline's INPUT; an `api-reference.ts` entry is what
 * an agent can actually retrieve. Nothing connected the two, so a package could
 * be fully documented for humans and completely invisible to every assistant —
 * with no error anywhere, because absence is not a failure state.
 *
 * That is not hypothetical: `@pyreon/a11y` and `@pyreon/rich-text` both had
 * manifests and ZERO `get_api` entries until this gate was written.
 *
 * A package may be reachable EITHER through generated regions (a marker pair)
 * or through hand-written entries — `@pyreon/i18n` is the latter — so the check
 * is on the reachable KEYS, not on the marker. Checking markers would demand a
 * migration the pipeline explicitly makes optional.
 */
function findUnreachablePackages(): string[] {
  const apiRef = join(REPO_ROOT, 'packages/tools/mcp/src/api-reference.ts')
  if (!existsSync(apiRef)) return []
  const src = readFileSync(apiRef, 'utf8')
  // Entry keys are `'<package>/<symbol>'` at the top level of the record.
  const served = new Set(
    [...src.matchAll(/^ {2}'([a-z][a-z0-9-]*)\//gm)].map((m) => m[1]!),
  )
  const out: string[] = []
  const pkgsDir = join(REPO_ROOT, 'packages')
  for (const cat of readdirSync(pkgsDir)) {
    const catDir = join(pkgsDir, cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const pkg of readdirSync(catDir)) {
      if (!existsSync(join(catDir, pkg, 'src', 'manifest.ts'))) continue
      // The MCP package documents its own TOOLS, not an importable API.
      if (pkg === 'mcp') continue
      if (!served.has(pkg)) out.push(pkg)
    }
  }
  return out.sort()
}

function main(): void {
  const result = check()
  const json = process.argv.includes('--json')

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }

  if (!result.ok && result.unreachable.length > 0) {
    console.error(
      `✗ ${result.unreachable.length} package(s) have a manifest but NO get_api entry, ` +
        `so an agent asking about them gets nothing:\n`,
    )
    for (const pkg of result.unreachable) console.error(`  @pyreon/${pkg}`)
    console.error(
      `\n  Fix: add a marker pair to packages/tools/mcp/src/api-reference.ts —\n` +
        `    // <gen-docs:api-reference:start @pyreon/<name>>\n` +
        `    // <gen-docs:api-reference:end @pyreon/<name>>\n` +
        `  then run \`bun run gen-docs\` to fill it from the package's manifest.\n`,
    )
  }

  if (result.ok) {
    console.log(
      `✓ MCP docs gate clean. ${result.toolCount} tool(s) registered, ` +
        `${result.documented.length} documented in docs/src/content/docs/mcp.md.`,
    )
    process.exit(0)
  }

  console.error('✗ MCP docs drift detected.')
  console.error('')
  console.error(
    `  ${result.missing.length} of ${result.toolCount} tool(s) lack a "### <name>" section in docs/src/content/docs/mcp.md:`,
  )
  console.error('')
  for (const entry of result.missing) {
    console.error(`    - ${entry.tool}  (${entry.signature})`)
  }
  console.error('')
  console.error(
    '  Add a section to docs/src/content/docs/mcp.md following the existing pattern (description + Parameters table + Example call).',
  )
  console.error(
    '  See docs/src/content/docs/mcp.md "Tools by intent" navigator for the canonical ordering.',
  )
  process.exit(1)
}

if (import.meta.main) {
  main()
}

export { check, readManifestTools, readDocSections }
