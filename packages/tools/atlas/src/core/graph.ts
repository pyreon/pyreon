/**
 * The Catalog Graph — the queryable, machine-readable model of a whole library
 * that both the UI and agents read from.
 *
 * Surfaces:
 *   - `toJSON()`       — the typed machine surface
 *   - `toLlmsText()`   — a compact `llms.txt`-style catalog
 *   - `toAgentGuide()` — a PRESCRIPTIVE, token-efficient guide so an AI uses
 *                        each component correctly (exact allowed values, a
 *                        correct example, and what to avoid)
 *   - `search()`       — the data-layer search the UI + agents use
 */
import type {
  CatalogGraphData,
  ComponentIntelligence,
  PropControl,
  Scenario,
  VerifyVerdict,
} from './types'

/** A single search match, ranked by `score` (higher = better). */
export interface SearchHit {
  component: string
  kind: 'component' | 'scenario'
  scenario?: string
  score: number
}

export interface CatalogGraph {
  /** add or replace a component (keyed by name); chainable. */
  add(ci: ComponentIntelligence): CatalogGraph
  /** every component, in insertion order. */
  list(): ComponentIntelligence[]
  /** a component by name, or undefined. */
  get(name: string): ComponentIntelligence | undefined
  /** every scenario across every component. */
  scenarios(): Scenario[]
  /** components carrying the given tag. */
  findByTag(tag: string): ComponentIntelligence[]
  /** ranked matches across component names, tags, props, and scenario names. */
  search(query: string): SearchHit[]
  /** total component count. */
  size(): number
  /** the serialized machine surface. */
  toJSON(): CatalogGraphData
  /** the compact `llms.txt`-style catalog for coding agents. */
  toLlmsText(): string
  /** a prescriptive, token-efficient usage guide for AI agents. */
  toAgentGuide(): string
}

/** Create an empty graph, optionally seeded with components. */
export function createCatalogGraph(initial: readonly ComponentIntelligence[] = []): CatalogGraph {
  // insertion-ordered map keyed by component name (last write wins).
  const byName = new Map<string, ComponentIntelligence>()
  for (const ci of initial) byName.set(ci.name, ci)

  const graph: CatalogGraph = {
    add(ci) {
      byName.set(ci.name, ci)
      return graph
    },
    list() {
      return [...byName.values()]
    },
    get(name) {
      return byName.get(name)
    },
    scenarios() {
      return [...byName.values()].flatMap((ci) => ci.scenarios)
    },
    findByTag(tag) {
      return [...byName.values()].filter((ci) => ci.tags.includes(tag))
    },
    search(query) {
      return searchCatalog([...byName.values()], query)
    },
    size() {
      return byName.size
    },
    toJSON() {
      return { version: 1, components: [...byName.values()] }
    },
    toLlmsText() {
      return renderLlmsText([...byName.values()])
    },
    toAgentGuide() {
      return renderAgentGuide([...byName.values()])
    },
  }
  return graph
}

/** Rank components + scenarios against a free-text query (case-insensitive). */
function searchCatalog(components: readonly ComponentIntelligence[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q === '') return []
  const hits: SearchHit[] = []
  for (const ci of components) {
    let score = 0
    if (ci.name.toLowerCase().includes(q)) score += 10
    if (ci.tags.some((t) => t.toLowerCase().includes(q))) score += 5
    if (ci.controls.some((c) => c.name.toLowerCase().includes(q))) score += 2
    if (score > 0) hits.push({ component: ci.name, kind: 'component', score })
    for (const s of ci.scenarios) {
      if (s.name.toLowerCase().includes(q)) {
        hits.push({ component: ci.name, kind: 'scenario', scenario: s.name, score: 3 })
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score)
}

/** Render the agent-facing catalog. Deterministic, so diffs are meaningful. */
function renderLlmsText(components: readonly ComponentIntelligence[]): string {
  const lines: string[] = ['# Component Catalog', '']
  for (const ci of components) {
    lines.push(`## ${ci.name}`)
    if (ci.summary) lines.push(ci.summary)
    if (ci.tags.length > 0) lines.push(`tags: ${ci.tags.join(', ')}`)
    if (ci.controls.length > 0) {
      const controls = ci.controls
        .map((c) => `${c.name}: ${c.kind}${c.required ? ' (required)' : ''}`)
        .join(', ')
      lines.push(`props: ${controls}`)
    }
    if (ci.scenarios.length > 0) {
      lines.push(`scenarios (${ci.scenarios.length}):`)
      for (const s of ci.scenarios) {
        const verdict = s.verify ? (s.verify.ok ? ' [pass]' : ' [FAIL]') : ''
        lines.push(`  - ${s.name} [${s.source}]${verdict}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** Compact prop descriptor: `state(primary|secondary)`, `label(text)`, `on(bool)`. */
function formatControl(c: PropControl): string {
  if (c.kind === 'select' && c.options && c.options.length > 0) {
    return `${c.name}(${c.options.join('|')})`
  }
  const type = c.kind === 'reactive' ? '()=>…' : c.kind === 'boolean' ? 'bool' : c.kind
  return `${c.name}(${type})`
}

/** Join the findings of every failed check on a verdict. */
function collectFindings(verify: VerifyVerdict): string {
  const keys = ['a11y', 'interaction', 'reactivityCoverage', 'leak', 'snapshot'] as const
  const findings: string[] = []
  for (const key of keys) {
    const check = verify[key]
    if (check.status === 'fail' && check.findings) findings.push(...check.findings)
  }
  return findings.join('; ')
}

/**
 * Render a PRESCRIPTIVE, token-efficient guide: exact allowed prop values, a
 * known-correct example, and what to avoid — so an AI uses each component
 * right on the first try, with minimal tokens.
 */
function renderAgentGuide(components: readonly ComponentIntelligence[]): string {
  const lines: string[] = [
    '# Agent Guide',
    '',
    'Minimal correct usage per component. Use ONLY the listed prop values.',
    '',
  ]
  for (const ci of components) {
    const tags = ci.tags.length > 0 ? ` [${ci.tags.join(', ')}]` : ''
    lines.push(`## ${ci.name}${tags}`)

    const required = ci.controls.filter((c) => c.required)
    const optional = ci.controls.filter((c) => !c.required)
    if (required.length > 0) lines.push(`required: ${required.map(formatControl).join(', ')}`)
    if (optional.length > 0) lines.push(`optional: ${optional.map(formatControl).join(', ')}`)

    const reactive = ci.controls.filter((c) => c.reactive).map((c) => c.name)
    if (reactive.length > 0) lines.push(`reactive (pass a signal accessor): ${reactive.join(', ')}`)

    const good = ci.scenarios.find(
      (s) => s.verify?.ok !== false && Object.keys(s.args).length > 0,
    )
    if (good) lines.push(`correct: ${JSON.stringify(good.args)}`)

    for (const s of ci.scenarios) {
      if (s.verify && !s.verify.ok) {
        const why = collectFindings(s.verify)
        if (why) lines.push(`avoid: "${s.name}" — ${why}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}
