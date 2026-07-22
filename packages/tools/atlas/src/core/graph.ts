/**
 * The Catalog Graph — the queryable, machine-readable model of a whole library
 * that both the UI and agents read from. `toJSON()` is the typed machine
 * surface; `toLlmsText()` is the compact catalog any coding agent can consume.
 */
import type { CatalogGraphData, ComponentIntelligence, Scenario } from './types'

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
  /** total component count. */
  size(): number
  /** the serialized machine surface. */
  toJSON(): CatalogGraphData
  /** the compact `llms.txt`-style catalog for coding agents. */
  toLlmsText(): string
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
    size() {
      return byName.size
    },
    toJSON() {
      return { version: 1, components: [...byName.values()] }
    },
    toLlmsText() {
      return renderLlmsText([...byName.values()])
    },
  }
  return graph
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
