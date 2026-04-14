import type { PackageManifest } from './types'

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
  const gotchaSuffix = m.gotchas && m.gotchas.length > 0 ? `. ${m.gotchas[0]}` : ''
  return `- ${m.name} — ${m.tagline}${peerSuffix}${gotchaSuffix}`
}

/**
 * Render a manifest to its `llms-full.txt` per-package section. Emits:
 *
 * ```
 * ## @pyreon/<name> — <title OR tagline>
 *
 * ```typescript
 * <longExample OR synthesized from api[].example concatenation>
 * ```
 *
 * > **Peer dep**: ...   (only if peerDeps set)
 * >
 * > **Note**: ...       (one blockquote per gotcha)
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
 *   description: 'd',
 *   category: 'browser',
 *   features: [],
 *   api: [],
 *   longExample: `const flow = createFlow({ nodes: [], edges: [] })`,
 * })
 * renderLlmsFullSection(m)
 * // → "## @pyreon/flow — Flow Diagrams\n\n```typescript\n...\n```\n"
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
    blockquotes.push(`> **Note**: ${gotcha}`)
  }

  const parts = [header, '', codeBlock]
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
