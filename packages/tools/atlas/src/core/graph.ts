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
import { componentKey, resolveComponent } from './identity'

/** A single search match, ranked by `score` (higher = better). */
export interface SearchHit {
  component: string
  kind: 'component' | 'scenario'
  scenario?: string
  score: number
}

export interface CatalogGraph {
  /** add or replace a component (keyed by `componentKey` — `project/Name` in a monorepo); chainable. */
  add(ci: ComponentIntelligence): CatalogGraph
  /** every component, in insertion order. */
  list(): ComponentIntelligence[]
  /**
   * A component by KEY or by bare NAME, or undefined.
   *
   * A bare name matching several components across projects returns undefined
   * rather than an arbitrary one — see `resolveComponent`.
   */
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
  // Insertion-ordered, keyed by component KEY — `project/Name` in a monorepo,
  // bare `Name` otherwise (see `./identity`).
  //
  // It used to key on `name` alone, which meant two packages each exporting a
  // `Button` collapsed into one with no error and no warning: the catalog's own
  // silent-drop, in the tool built to prevent them. Single-package scans set no
  // `project`, so their keys are unchanged.
  const byKey = new Map<string, ComponentIntelligence>()
  for (const ci of initial) byKey.set(componentKey(ci), ci)

  const graph: CatalogGraph = {
    add(ci) {
      byKey.set(componentKey(ci), ci)
      return graph
    },
    list() {
      return [...byKey.values()]
    },
    get(name) {
      // Accepts a key OR a bare name. A bare name that matches several
      // components across projects resolves to `undefined` rather than to
      // whichever happened to be first — guessing there is how the original bug
      // stayed invisible.
      return resolveComponent([...byKey.values()], name).found
    },
    scenarios() {
      return [...byKey.values()].flatMap((ci) => ci.scenarios)
    },
    findByTag(tag) {
      return [...byKey.values()].filter((ci) => ci.tags.includes(tag))
    },
    search(query) {
      return searchCatalog([...byKey.values()], query)
    },
    size() {
      return byKey.size
    },
    toJSON() {
      return { version: 1, components: [...byKey.values()] }
    },
    toLlmsText() {
      return renderLlmsText([...byKey.values()])
    },
    toAgentGuide() {
      return renderAgentGuide([...byKey.values()])
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
        // Three states, not two. A scenario nothing checked is `[unverified]`,
        // never `[pass]` — still a real state, because two of the five
        // verify checks are stubs.
        const verdict = s.verify
          ? s.verify.ok
            ? ' [pass]'
            : s.verify.checked === 0
              ? ' [unverified]'
              : ' [FAIL]'
          : ''
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

    // "correct:" is a claim, so it needs a VERIFIED scenario behind it. The
    // previous filter was `verify?.ok !== false`, which also accepted scenarios
    // nothing had checked — the guide asserted correctness on no evidence.
    // An unverified scenario is still useful as a starting point, so it is
    // offered under a weaker word rather than dropped.
    const withArgs = ci.scenarios.filter((s) => Object.keys(s.args).length > 0)
    const verified = withArgs.find((s) => s.verify?.ok === true)
    if (verified) {
      lines.push(`correct: ${JSON.stringify(verified.args)}`)
    } else {
      const unverified = withArgs.find((s) => s.verify === undefined || s.verify.checked === 0)
      if (unverified) lines.push(`example (unverified): ${JSON.stringify(unverified.args)}`)
    }

    for (const s of ci.scenarios) {
      // Only a real FAILURE earns an "avoid" — an unverified scenario has no
      // findings to report and must not be smeared as bad.
      if (s.verify && !s.verify.ok && s.verify.checked > 0) {
        const why = collectFindings(s.verify)
        if (why) lines.push(`avoid: "${s.name}" — ${why}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}
