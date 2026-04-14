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
 */
export function renderLlmsTxtLine(m: PackageManifest): string {
  const peerSuffix =
    m.peerDeps && m.peerDeps.length > 0 ? ` (peer: ${m.peerDeps.join(', ')})` : ''
  const gotchaSuffix = m.gotchas && m.gotchas.length > 0 ? `. ${m.gotchas[0]}` : ''
  return `- ${m.name} — ${m.tagline}${peerSuffix}${gotchaSuffix}`
}

/**
 * Minimal unified-diff output for the gen-docs CLI `--check` failure
 * message. Not a full patch — just lines that differ, marked
 * `- before` / `+ after`. Good enough for a CLI pointer that tells
 * reviewers exactly what would change, without depending on a diff
 * library.
 */
export function formatLineDiff(before: string, after: string): string {
  const a = before.split('\n')
  const b = after.split('\n')
  const out: string[] = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    const l = a[i]
    const r = b[i]
    if (l === r) continue
    if (l !== undefined) out.push(`- ${l}`)
    if (r !== undefined) out.push(`+ ${r}`)
  }
  return out.join('\n')
}
