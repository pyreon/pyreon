#!/usr/bin/env bun
/**
 * Generate per-package API REFERENCE pages from the `src/manifest.ts` files
 * (the same manifests that feed `llms.txt` + MCP `get_api`). Emits one
 * `docs/src/content/docs/reference/<slug>.md` per manifested package, using a
 * fixed Next.js-style template per symbol:
 *
 *   <name>  `<kind>`  [stability badge]
 *   signature (ts code fence)
 *   summary
 *   Example (code fence)
 *   Common mistakes (from ApiEntry.mistakes)
 *   See also (from ApiEntry.seeAlso)
 *
 * Plus a top-of-page "Exports" index table and the package-level `gotchas`.
 *
 * Also writes `docs/src/reference-nav.generated.ts` — the sidebar entries for
 * the generated pages, imported + spread into the Reference tier by
 * `sidebar-config.ts`.
 *
 * Single source of truth: the manifest. NEVER hand-edit the generated pages.
 * Run: `bun docs/scripts/gen-reference.ts` from the repo root.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findManifests } from '../../packages/internals/manifest/src/discovery'
import { escFlow, fence, yaml } from './_md-safe'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT_DIR = join(REPO_ROOT, 'docs', 'src', 'content', 'docs', 'reference')
const NAV_FILE = join(REPO_ROOT, 'docs', 'src', 'reference-nav.generated.ts')

const slugOf = (name: string) => name.replace(/^@pyreon\//, '')
/** Anchor a symbol name the way the markdown renderer slugifies headings. */
const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const KIND_LABEL: Record<string, string> = {
  function: 'function',
  hook: 'hook',
  component: 'component',
  type: 'type',
  class: 'class',
  constant: 'constant',
}

function renderEntry(e: any): string {
  const parts: string[] = []
  const kind = KIND_LABEL[e.kind] ?? e.kind
  const stab =
    e.stability === 'deprecated'
      ? ' — **⚠ deprecated**'
      : e.stability === 'experimental'
        ? ' — **experimental**'
        : ''
  parts.push(`### ${e.name} \`${kind}\`${stab}`)
  if (e.deprecated?.replacement) {
    parts.push(`> **Deprecated** — use \`${e.deprecated.replacement}\` instead.`)
  }
  if (e.signature) parts.push(fence('ts', e.signature))
  if (e.summary) parts.push(escFlow(e.summary))
  // Parameters table (optional structured field). Types go in inline-code
  // (backtick) cells so `<`/`>` in generics are literal to the MDX pipeline;
  // `|` (unions) is cell-escaped. Description flows through escFlow.
  if (Array.isArray(e.params) && e.params.length) {
    parts.push('**Parameters**')
    const rows = ['| Parameter | Type | Description |', '| --- | --- | --- |']
    for (const p of e.params) {
      const nm = `\`${p.name}${p.optional ? '?' : ''}\``
      const ty = `\`${String(p.type).replace(/\|/g, '\\|')}\``
      const desc = escFlow(String(p.description)).replace(/\|/g, '\\|').replace(/\n/g, ' ')
      rows.push(`| ${nm} | ${ty} | ${desc} |`)
    }
    parts.push(rows.join('\n'))
  }
  if (e.returns) {
    const ty = `\`${String(e.returns.type).replace(/\|/g, '\\|')}\``
    parts.push(`**Returns** ${ty} — ${escFlow(String(e.returns.description))}`)
  }
  if (e.example) {
    parts.push('**Example**')
    parts.push(fence('tsx', e.example))
  }
  if (Array.isArray(e.mistakes) && e.mistakes.length) {
    parts.push('**Common mistakes**')
    parts.push(e.mistakes.map((m: string) => `- ${escFlow(m)}`).join('\n'))
  }
  if (Array.isArray(e.seeAlso) && e.seeAlso.length) {
    parts.push('**See also:** ' + e.seeAlso.map((s: string) => `\`${s}\``).join(' · '))
  }
  return parts.join('\n\n')
}

function renderGotcha(g: any): string {
  if (typeof g === 'string') return `> **Note:** ${escFlow(g)}`
  return `> **${escFlow(g.label)}:** ${escFlow(g.note)}`
}

function renderPage(m: any): string {
  const slug = slugOf(m.name)
  const api = Array.isArray(m.api) ? m.api : []
  const out: string[] = []
  out.push('---')
  out.push(`title: ${yaml(`${m.title ?? m.name} — API Reference`)}`)
  out.push(`description: ${yaml((m.tagline ?? m.description ?? '').slice(0, 160))}`)
  out.push('---')
  out.push('')
  out.push(`# ${m.name} — API Reference`)
  out.push('')
  out.push(
    `> **Generated** from \`${slug}\`'s \`src/manifest.ts\` — the same source that powers \`llms.txt\` and MCP \`get_api\`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [${slug}](/docs/${slug}).`,
  )
  out.push('')
  if (m.description) {
    out.push(escFlow(m.description))
    out.push('')
  }
  if (Array.isArray(m.peerDeps) && m.peerDeps.length) {
    out.push(
      `> **Peer dependencies:** ${m.peerDeps.map((d: string) => `\`${d}\``).join(', ')} — install alongside this package.`,
    )
    out.push('')
  }
  if (Array.isArray(m.features) && m.features.length) {
    out.push('## Features')
    out.push('')
    out.push(m.features.map((f: string) => `- ${escFlow(f)}`).join('\n'))
    out.push('')
  }
  if (m.longExample) {
    out.push('## Complete example')
    out.push('')
    out.push('A full, end-to-end usage of the package:')
    out.push('')
    out.push(fence('tsx', m.longExample))
    out.push('')
  }
  // Exports index table — at-a-glance, Next.js-style.
  if (api.length) {
    out.push('## Exports')
    out.push('')
    out.push('| Symbol | Kind | Summary |')
    out.push('| --- | --- | --- |')
    for (const e of api) {
      // Table cells are plain-text flow content: escape `<`/`>` (the MDX-ish
      // pipeline would otherwise read `Signal<T>` as a JSX tag and choke on
      // the `|` cell delimiter) and the pipe itself.
      const raw = String(e.summary ?? '').split(/(?<=\.)\s/)[0].slice(0, 120)
      const oneLine = escFlow(raw).replace(/\|/g, '\\|').replace(/\n/g, ' ')
      out.push(`| [\`${e.name}\`](#${anchor(e.name)}) | ${KIND_LABEL[e.kind] ?? e.kind} | ${oneLine} |`)
    }
    out.push('')
  }
  out.push('## API')
  out.push('')
  for (const e of api) {
    out.push(renderEntry(e))
    out.push('')
    out.push('---')
    out.push('')
  }
  if (Array.isArray(m.gotchas) && m.gotchas.length) {
    out.push('## Package-level notes')
    out.push('')
    for (const g of m.gotchas) {
      out.push(renderGotcha(g))
      out.push('')
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

// ─── run ───────────────────────────────────────────────────────────────────
const manifests = await findManifests(REPO_ROOT)
mkdirSync(OUT_DIR, { recursive: true })

const navByCategory: Record<string, { text: string; slug: string }[]> = {}
let pageCount = 0
let entryCount = 0

for (const { manifest: m } of manifests) {
  const api = Array.isArray((m as any).api) ? (m as any).api : []
  if (!api.length) continue // skip manifests with no public API surface
  const slug = slugOf(m.name)
  writeFileSync(join(OUT_DIR, `${slug}.md`), renderPage(m))
  pageCount++
  entryCount += api.length
  const cat = (m as any).category ?? 'other'
  ;(navByCategory[cat] ??= []).push({ text: m.name.replace(/^@pyreon\//, ''), slug: `reference/${slug}` })
}

// Emit the sidebar fragment (sorted within category, categories ordered).
const CAT_ORDER = ['universal', 'browser', 'server', 'other']
const CAT_TITLE: Record<string, string> = {
  universal: 'API Reference — Core & Data',
  browser: 'API Reference — UI & Browser',
  server: 'API Reference — Server & Tooling',
  other: 'API Reference — Other',
}
const groups: { text: string; tier?: string; collapsed?: boolean; items: { text: string; slug: string }[] }[] =
  CAT_ORDER.filter((c) => navByCategory[c]?.length).map((c) => ({
    text: CAT_TITLE[c],
    collapsed: true,
    items: navByCategory[c].sort((a, b) => a.text.localeCompare(b.text)),
  }))
// First generated group opens the "API Reference" tier (header rendered once).
if (groups[0]) groups[0].tier = 'API Reference'

const navSrc = `// GENERATED by docs/scripts/gen-reference.ts — do not edit.
// Auto-generated API-reference sidebar groups (Reference tier). Regenerate
// with \`bun docs/scripts/gen-reference.ts\`.
import type { SidebarGroup } from './sidebar-config'

export const REFERENCE_GROUPS: SidebarGroup[] = ${JSON.stringify(groups, null, 2)}
`
writeFileSync(NAV_FILE, navSrc)

console.warn(
  `[gen-reference] ${pageCount} reference pages, ${entryCount} API symbols, ${groups.length} nav groups → docs/src/content/docs/reference/`,
)
