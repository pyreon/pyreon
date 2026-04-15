import type { ApiEntry, Gotcha, PackageManifest } from './types'

/**
 * Coerce a `Gotcha` (bare string or `{label, note}`) into its text pair.
 * Shared by both the llms.txt one-liner teaser and the llms-full
 * blockquote renderer.
 */
function gotchaParts(g: Gotcha): { label: string; note: string } {
  return typeof g === 'string' ? { label: 'Note', note: g } : g
}

/**
 * Render a manifest to its one-line `llms.txt` bullet form. Compact by
 * design — the full structured expansion lives in `llms-full.txt`
 * (follow-up PR). Includes peerDeps inline when present and the first
 * `gotcha` as a teaser so the one-liner retains meaningful density.
 *
 * Lives in `@pyreon/manifest` (not in `scripts/gen-docs-core.ts`) because
 * it's a pure type-level helper with no filesystem or CLI concerns —
 * the same reasoning that keeps `defineManifest` here. Tests import it
 * via `@pyreon/manifest`, avoiding rootDir cross-package headaches.
 *
 * @example
 * ```ts
 * import { defineManifest, renderLlmsTxtLine } from '@pyreon/manifest'
 *
 * const m = defineManifest({
 *   name: '@pyreon/flow',
 *   tagline: 'Reactive flow diagrams',
 *   description: 'd',
 *   category: 'browser',
 *   peerDeps: ['@pyreon/runtime-dom'],
 *   features: [],
 *   api: [],
 * })
 * renderLlmsTxtLine(m)
 * // → "- @pyreon/flow — Reactive flow diagrams (peer: @pyreon/runtime-dom)"
 * ```
 */
export function renderLlmsTxtLine(m: PackageManifest): string {
  const peerSuffix =
    m.peerDeps && m.peerDeps.length > 0 ? ` (peer: ${m.peerDeps.join(', ')})` : ''
  // Teaser uses the first gotcha's `note` text regardless of form —
  // the `label` is a heading cue for llms-full blockquotes, not for
  // the one-line bullet.
  const gotchaSuffix =
    m.gotchas && m.gotchas.length > 0 ? `. ${gotchaParts(m.gotchas[0]!).note}` : ''
  return `- ${m.name} — ${m.tagline}${peerSuffix}${gotchaSuffix}`
}

/**
 * Render a manifest to its `llms-full.txt` per-package section. Emits:
 *
 * ```
 * ## @pyreon/<name> — <title OR tagline>
 *
 * <description paragraph — from manifest.description>
 *
 * ```typescript
 * <longExample OR synthesized from api[].example concatenation>
 * ```
 *
 * > **Peer dep**: ...              (only if peerDeps set)
 * >
 * > **<Label>**: ...               (one blockquote per gotcha —
 *                                    labeled form uses the label,
 *                                    bare string defaults to "Note")
 * ```
 *
 * Output terminates with a single trailing newline so the generator
 * can concatenate multiple sections with blank-line separators that
 * match the existing file's shape.
 *
 * @example
 * ```ts
 * import { defineManifest, renderLlmsFullSection } from '@pyreon/manifest'
 *
 * const m = defineManifest({
 *   name: '@pyreon/flow',
 *   title: 'Flow Diagrams',
 *   tagline: 'Reactive flow diagrams',
 *   description: 'Reactive flow diagrams for Pyreon. Signal-native nodes and edges.',
 *   category: 'browser',
 *   features: [],
 *   api: [],
 *   longExample: `const flow = createFlow({ nodes: [], edges: [] })`,
 *   gotchas: [{ label: 'JSX generics', note: '<Flow<T> /> is invalid JSX.' }],
 * })
 * renderLlmsFullSection(m)
 * // → "## @pyreon/flow — Flow Diagrams\n\nReactive flow diagrams for Pyreon. ...\n\n```typescript\n...\n```\n\n> **JSX generics**: ...\n"
 * ```
 */
export function renderLlmsFullSection(m: PackageManifest): string {
  const title = m.title ?? m.tagline
  const header = `## ${m.name} — ${title}`

  const body = m.longExample ?? synthesizeExampleFromApi(m)
  const codeBlock = `\`\`\`typescript\n${body}\n\`\`\``

  const blockquotes: string[] = []
  if (m.peerDeps && m.peerDeps.length > 0) {
    blockquotes.push(
      `> **Peer dep${m.peerDeps.length === 1 ? '' : 's'}**: ${m.peerDeps.join(', ')}`,
    )
  }
  for (const gotcha of m.gotchas ?? []) {
    const { label, note } = gotchaParts(gotcha)
    blockquotes.push(`> **${label}**: ${note}`)
  }

  // description sits between the header and the code block when
  // present. Empty / whitespace-only / missing descriptions suppress
  // the paragraph entirely — no silent fallback to tagline. Authors
  // who want prose above the code block set `description` to a real
  // sentence; everyone else gets `## header → code block` directly.
  const prose = (m.description ?? '').trim()

  const parts = prose
    ? [header, '', prose, '', codeBlock]
    : [header, '', codeBlock]
  if (blockquotes.length > 0) {
    parts.push('', blockquotes.join('\n>\n'))
  }
  return parts.join('\n') + '\n'
}

function synthesizeExampleFromApi(m: PackageManifest): string {
  // Fallback path when `longExample` is not set — concatenate
  // individual `api[].example` blocks with blank-line separators.
  // Not as narrative as a hand-crafted longExample but gives
  // something coherent for packages that skip the optional field.
  return m.api
    .filter((entry) => entry.example.trim().length > 0)
    .map((entry) => entry.example)
    .join('\n\n')
}

/**
 * Unified-diff output for the gen-docs CLI `--check` failure message.
 * Uses an LCS (longest-common-subsequence) backtrace so inserted or
 * removed lines mid-file produce a coherent diff instead of the
 * index-paired output a naive implementation would give.
 *
 * Context-line radius: none — we only emit `- before` / `+ after`
 * lines for the lines that actually differ. Good enough for a CLI
 * pointer; reviewers open their editor for full context.
 *
 * Complexity is O(m * n) in time + space on the line count. Fine for
 * our largest file (llms.txt < 500 lines); if we ever diff a 10k-line
 * surface, swap in a proper Myers implementation.
 *
 * @example
 * ```ts
 * import { formatLineDiff } from '@pyreon/manifest'
 *
 * formatLineDiff('a\nb\nc', 'a\nX\nc')
 * // → "- b\n+ X"
 * ```
 */
/**
 * MCP `api-reference.ts` record value shape — kept local so
 * `@pyreon/manifest` does not take a dev dep on `@pyreon/mcp`.
 * Must stay in sync with `packages/tools/mcp/src/api-reference.ts`.
 */
export interface McpApiReferenceEntry {
  signature: string
  example: string
  notes?: string
  mistakes?: string
}

/**
 * Render a manifest's `api[]` to the MCP `api-reference.ts`
 * record shape: `{ "pkg/symbol": { signature, example, notes?,
 * mistakes? } }`. The `pkg` key strips the `@pyreon/` scope.
 *
 * Field mapping:
 * - `ApiEntry.signature` → `signature` (verbatim)
 * - `ApiEntry.example`   → `example` (verbatim)
 * - `ApiEntry.summary`   → `notes` (verbatim when non-empty)
 * - `ApiEntry.mistakes`  → `mistakes` (joined as `- item` bullets
 *    so MCP clients render them as a markdown list)
 *
 * Rationale for the field remap: the MCP shape pre-dates the
 * manifest type and exposes its own hand-written vocabulary
 * (`notes`/`mistakes`) that was designed to be free-form prose.
 * The manifest splits the same concept into structured
 * `summary`/`mistakes` (arrays for per-item control). This helper
 * bridges the two without either surface needing to adopt the
 * other's shape.
 *
 * @example
 * ```ts
 * import { defineManifest, renderApiReferenceEntries } from '@pyreon/manifest'
 *
 * const m = defineManifest({
 *   name: '@pyreon/flow',
 *   tagline: 't',
 *   description: 'd',
 *   category: 'browser',
 *   features: [],
 *   api: [{
 *     name: 'createFlow',
 *     kind: 'function',
 *     signature: 'createFlow(config): FlowInstance',
 *     summary: 'Create a reactive flow.',
 *     example: 'const f = createFlow({})',
 *     mistakes: ['Missing peer dep'],
 *   }],
 * })
 * renderApiReferenceEntries(m)
 * // → { 'flow/createFlow': { signature: ..., example: ..., notes: 'Create a reactive flow.', mistakes: '- Missing peer dep' } }
 * ```
 */
export function renderApiReferenceEntries(
  m: PackageManifest,
): Record<string, McpApiReferenceEntry> {
  const shortName = stripPyreonScope(m.name)
  const out: Record<string, McpApiReferenceEntry> = {}
  for (const api of m.api) {
    out[`${shortName}/${api.name}`] = toMcpEntry(api)
  }
  return out
}

/**
 * Render a manifest's `api[]` to the source-code form that lives
 * between the region markers in
 * `packages/tools/mcp/src/api-reference.ts` — indented TS
 * object-literal entries, one per API, joined by blank lines, with
 * the closing brace comma-terminated to match the file's style.
 *
 * Output matches the file's indentation (two-space + two-space
 * inner) and uses template literals for multi-line `example` /
 * `mistakes` values. The generator injects this between the
 * `// <gen-docs:api-reference:start @pyreon/<name>>` and matching
 * `end` markers; insertion order follows `manifest.api[]`.
 *
 * @example
 * ```ts
 * renderApiReferenceBlock(flowManifest)
 * // → "  'flow/createFlow': {\n    signature: '...',\n    ...\n  },\n\n  'flow/useFlow': { ... },"
 * ```
 */
export function renderApiReferenceBlock(m: PackageManifest): string {
  const shortName = stripPyreonScope(m.name)
  const chunks: string[] = []
  for (const api of m.api) {
    chunks.push(renderSingleEntry(`${shortName}/${api.name}`, toMcpEntry(api)))
  }
  return chunks.join('\n\n')
}

function stripPyreonScope(name: string): string {
  return name.startsWith('@pyreon/') ? name.slice('@pyreon/'.length) : name
}

function toMcpEntry(api: ApiEntry): McpApiReferenceEntry {
  const entry: McpApiReferenceEntry = {
    signature: api.signature,
    example: api.example,
  }
  const notes = api.summary.trim()
  if (notes) entry.notes = notes
  if (api.mistakes && api.mistakes.length > 0) {
    entry.mistakes = api.mistakes.map((m) => `- ${m}`).join('\n')
  }
  return entry
}

function renderSingleEntry(key: string, e: McpApiReferenceEntry): string {
  // Indentation matches the file: keys + simple fields at 2 spaces,
  // long / multi-line string literals use backtick template form
  // even for single-line values so the emitted code is stable
  // across trivial changes.
  const lines: string[] = []
  lines.push(`  '${key}': {`)
  lines.push(`    signature: ${renderStringLiteral(e.signature)},`)
  lines.push(`    example: ${renderStringLiteral(e.example)},`)
  if (e.notes !== undefined) {
    lines.push(`    notes: ${renderStringLiteral(e.notes)},`)
  }
  if (e.mistakes !== undefined) {
    lines.push(`    mistakes: ${renderStringLiteral(e.mistakes)},`)
  }
  lines.push(`  },`)
  return lines.join('\n')
}

/**
 * Emit a TS string-literal form of `s`. Single-line strings without
 * `'` or backslash use a quoted literal; anything else uses a
 * backtick template literal with `${` and `` ` `` escaped. Keeps
 * the emitted code readable while remaining round-trippable.
 */
function renderStringLiteral(s: string): string {
  const hasNewline = s.includes('\n')
  const hasBacktick = s.includes('`')
  const hasBackslash = s.includes('\\')
  const hasDollarBrace = s.includes('${')

  if (!hasNewline && !hasBackslash && !s.includes("'")) {
    return `'${s}'`
  }
  // Template literal — escape backticks and `${`.
  let body = s
  if (hasBacktick) body = body.replace(/`/g, '\\`')
  if (hasDollarBrace) body = body.replace(/\$\{/g, '\\${')
  return `\`${body}\``
}

export function formatLineDiff(before: string, after: string): string {
  const a = before.split('\n')
  const b = after.split('\n')
  const m = a.length
  const n = b.length

  // LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i]![j] = dp[i + 1]![j + 1]! + 1
      else dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }

  // Backtrace — emit `-` for lines in a not in LCS, `+` for lines in b
  // not in LCS, skip lines that match.
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push(`- ${a[i]}`)
      i++
    } else {
      out.push(`+ ${b[j]}`)
      j++
    }
  }
  while (i < m) {
    out.push(`- ${a[i]}`)
    i++
  }
  while (j < n) {
    out.push(`+ ${b[j]}`)
    j++
  }

  return out.join('\n')
}
