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
import { CHECK_KEYS } from './types'
import { componentKey, fileQualifierFor, pathQualifierFor, resolveComponent } from './identity'

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

  /**
   * Insert, qualifying by PATH when a name genuinely collides.
   *
   * A same-named component in a different directory is ordinary — a per-page
   * `MainFilter`, an icon file exporting `Glyph`. Plain last-write-wins dropped
   * every one after the first; measured on a real monorepo, 1042 components.
   *
   * The FIRST occupant is re-keyed too, so neither wins by arriving first and
   * both carry the directory that tells them apart. A repeat from the SAME
   * source is a genuine re-registration (a plugin refining a component) and
   * still replaces.
   */
  const insert = (ci: ComponentIntelligence): void => {
    const key = componentKey(ci)
    const existing = byKey.get(key)
    if (!existing || existing.source === ci.source) {
      byKey.set(key, ci)
      return
    }
    // Directory first, then FILENAME when the directory is shared. A generated
    // icon package puts 995 `Glyph` files in one directory, so directory alone
    // still collapsed 994 of them.
    let incoming = pathQualifierFor(ci.source)
    let held = pathQualifierFor(existing.source)
    if (!incoming || !held || incoming === held) {
      incoming = fileQualifierFor(ci.source)
      held = fileQualifierFor(existing.source)
    }
    // Genuinely nothing to tell them apart — keep the last, as before.
    if (!incoming || !held || incoming === held) {
      byKey.set(key, ci)
      return
    }
    byKey.delete(key)
    const requalified = { ...existing, pathQualifier: held }
    byKey.set(componentKey(requalified), requalified)
    const qualified = { ...ci, pathQualifier: incoming }
    byKey.set(componentKey(qualified), qualified)
  }

  for (const ci of initial) insert(ci)

  const graph: CatalogGraph = {
    add(ci) {
      insert(ci)
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
      return { version: 2, components: [...byKey.values()] }
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

/**
 * Join the findings of every failed check on a verdict.
 *
 * Derived from the verdict's OWN keys rather than a hand-written list. The
 * hand-written one had gone stale: it named five checks and `ssrParity` was
 * added as a sixth, so a hydration failure was recorded in the catalog and
 * then silently dropped from the agent guide and the llms text — the surfaces
 * an AI assistant actually reads. Exactly the hole `CHECK_KEYS` exists to
 * close, committed by the code that renders the catalog.
 */
function collectFindings(verify: VerifyVerdict): string {
  const findings: string[] = []
  for (const key of CHECK_KEYS) {
    const check = verify[key]
    if (check.status === 'fail' && check.findings) {
      // The FIX travels with the finding, so an agent reading only this text
      // still gets the actionable half rather than just the diagnosis.
      findings.push(...check.findings.map((f) => (f.fix ? `${f.message} → ${f.fix}` : f.message)))
    }
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
    // The guide describes the contract; this is how to CHECK against it.
    // Without the affordance the reader has to already know the command
    // exists, so the most valuable thing the catalog can do goes unused — the
    // same gap as knowing the legal values but having no way to ask.
    'Verify before you commit to a usage:',
    '',
    '    atlas check <Component> \'{"prop":"value"}\'',
    '',
    'It exits non-zero and names the problem — an invalid value (with the',
    'nearest legal one), an unknown prop, a wrong type, a missing required prop.',
    '',
    // Scenario labels below are `[pass]` / `[FAIL]` / `[unverified]`, and the
    // difference is load-bearing: presenting an unchecked state as a known-good
    // example is the failure the whole verify model exists to prevent.
    'Scenario labels are literal. `[pass]` means a check ran and passed;',
    '`[unverified]` means nothing examined it — it is not a weaker pass, and it',
    'is not evidence the usage is correct.',
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
