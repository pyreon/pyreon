/**
 * Atlas catalog support for the MCP server.
 *
 * `atlas scan` writes `atlas-catalog.json` — a verified component catalog with
 * each component's real props, allowed values, and scenarios. Until now nothing
 * served it: the assets were generated and handed to an `onAsset` sink, and an
 * agent had no way to ask for them. So an assistant writing Pyreon UI code was
 * guessing at prop names that a machine-readable, already-verified description
 * could have given it exactly.
 *
 * ── Why this reads a FILE instead of importing @pyreon/atlas ──────────────
 *
 * `@pyreon/mcp` is published; `@pyreon/atlas` is private. A published package
 * cannot depend on a private one. Reading the artifact is also the more robust
 * coupling — the server keeps working against a catalog produced by a different
 * Atlas version, and degrades to a clear "run `atlas scan`" instead of a
 * resolution error.
 *
 * ── The honesty rule this module exists to hold ───────────────────────────
 *
 * A scenario carries a verdict, and (as of the verify-honesty fix) `ok` means
 * VERIFIED — at least one check ran and none failed — while `checked: 0` means
 * nothing examined it. Four of Atlas' five checks are still stubs, so most
 * scenarios are unverified, and that is exactly what an agent must be told.
 * Presenting an unverified scenario as a known-good example is worse than
 * offering nothing: the agent cannot tell the difference and has no way to
 * check. Every rendering below carries the distinction through.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const CATALOG_FILENAME = 'atlas-catalog.json'

/**
 * One thing a check found — catalog `version: 2`.
 *
 * `code` is the stable, greppable class; `message` is prose; `fix` is the one
 * concrete next step, when there is one. Structured so an agent can branch on
 * the KIND of failure rather than pattern-match a sentence that is free to be
 * reworded between releases.
 */
export interface AtlasFinding {
  code: string
  message: string
  fix?: string
}

/** The subset of the catalog shape this server relies on. */
export interface AtlasVerifyCheck {
  status: 'pass' | 'fail' | 'skip'
  findings?: readonly AtlasFinding[]
}
export interface AtlasVerdict {
  ok: boolean
  /** how many checks actually ran; `0` = unverified, NOT clean */
  checked?: number
  a11y?: AtlasVerifyCheck
  interaction?: AtlasVerifyCheck
  reactivityCoverage?: AtlasVerifyCheck
  leak?: AtlasVerifyCheck
  snapshot?: AtlasVerifyCheck
}
export interface AtlasScenario {
  id: string
  name: string
  args: Record<string, unknown>
  source?: string
  verify?: AtlasVerdict
}
export interface AtlasControl {
  name: string
  kind: string
  required?: boolean
  options?: readonly string[]
  reactive?: boolean
}
export interface AtlasComponent {
  name: string
  summary?: string
  tags?: readonly string[]
  controls?: readonly AtlasControl[]
  scenarios?: readonly AtlasScenario[]
  source?: string
}
export interface AtlasCatalog {
  version: number
  components: readonly AtlasComponent[]
}

/**
 * Find `atlas-catalog.json` by walking up from `startDir`.
 *
 * Capped at 30 levels, matching `get_browser_smoke_status` — an uncapped walk
 * on a detached path can climb to `/` on every call.
 */
export function findCatalogPath(startDir: string): string | undefined {
  let dir = startDir
  for (let i = 0; i < 30; i += 1) {
    const candidate = join(dir, CATALOG_FILENAME)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * The catalog schema this server understands.
 *
 * Reading an OLDER catalog is refused rather than attempted. At v1 a finding
 * was a plain string; at v2 it is `{ code, message, fix? }` — so a v1 catalog
 * read by this code renders `undefined` for every finding and reports a
 * component's failures as blanks. Silently wrong is the worst outcome here,
 * because the reader is an agent that cannot see the blank is anomalous.
 */
export const SUPPORTED_CATALOG_VERSION = 2

export type LoadResult =
  | { ok: true; catalog: AtlasCatalog; path: string }
  | { ok: false; reason: 'missing' | 'unreadable' | 'stale-version'; detail?: string }

export function loadCatalog(startDir: string): LoadResult {
  const path = findCatalogPath(startDir)
  if (!path) return { ok: false, reason: 'missing' }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as AtlasCatalog
    if (!Array.isArray(parsed?.components)) {
      return { ok: false, reason: 'unreadable', detail: 'no `components` array' }
    }
    // A version we do not understand is refused, not best-efforted. An OLDER
    // one is the real case: its findings are strings, and reading them as
    // objects yields blanks rather than an error.
    if (parsed.version !== SUPPORTED_CATALOG_VERSION) {
      return {
        ok: false,
        reason: 'stale-version',
        detail:
          `catalog is version ${String(parsed.version)}, this server reads version ` +
          `${SUPPORTED_CATALOG_VERSION} — re-run \`atlas scan\` to regenerate it`,
      }
    }
    return { ok: true, catalog: parsed, path }
  } catch (err) {
    return { ok: false, reason: 'unreadable', detail: String(err) }
  }
}

/** `state(primary|secondary)`, `label(text)`, `onClick(()=>…)`. */
export function formatControl(c: AtlasControl): string {
  if (c.options && c.options.length > 0) return `${c.name}(${c.options.join('|')})`
  const kind = c.kind === 'reactive' ? '()=>…' : c.kind === 'boolean' ? 'bool' : c.kind
  return `${c.name}(${kind})`
}

/** Verified iff a check actually ran and none failed. */
export function isVerified(s: AtlasScenario): boolean {
  return s.verify?.ok === true && (s.verify.checked ?? 0) > 0
}

/** Did a check run at all? */
export function wasChecked(s: AtlasScenario): boolean {
  return (s.verify?.checked ?? 0) > 0
}

export interface ComponentStats {
  scenarios: number
  verified: number
  failed: number
  unverified: number
}

export function componentStats(component: AtlasComponent): ComponentStats {
  const scenarios = component.scenarios ?? []
  let verified = 0
  let failed = 0
  for (const s of scenarios) {
    if (isVerified(s)) verified += 1
    else if (wasChecked(s)) failed += 1
  }
  return {
    scenarios: scenarios.length,
    verified,
    failed,
    unverified: scenarios.length - verified - failed,
  }
}

/**
 * The whole-catalog index — one line per component, token-frugal, the shape an
 * agent scans before drilling in. Verification counts are on every line so a
 * reader never has to assume a catalogued component is a checked one.
 */
export function renderCatalogIndex(catalog: AtlasCatalog, tag?: string): string {
  const components = tag
    ? catalog.components.filter((c) => (c.tags ?? []).includes(tag))
    : catalog.components

  if (components.length === 0) {
    return tag
      ? `No components tagged "${tag}". Tags present: ${allTags(catalog).join(', ') || '(none)'}`
      : 'The catalog is empty. Run `atlas scan` in the project root.'
  }

  const lines = [
    `# Atlas catalog — ${components.length} component(s)`,
    '',
    'Verified = at least one check ran and none failed. Unverified means nothing',
    'examined the scenario; it is NOT a pass. Use `get_atlas_component` for the',
    'exact prop values of one component.',
    '',
  ]
  for (const c of components) {
    const stats = componentStats(c)
    const tags = (c.tags ?? []).length > 0 ? ` [${(c.tags ?? []).join(', ')}]` : ''
    lines.push(`## ${c.name}${tags}`)
    if (c.summary) lines.push(c.summary)
    const controls = c.controls ?? []
    if (controls.length > 0) lines.push(`props: ${controls.map(formatControl).join(', ')}`)
    lines.push(
      `scenarios: ${stats.scenarios} (${stats.verified} verified, ` +
        `${stats.failed} failing, ${stats.unverified} unverified)`,
    )
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

function allTags(catalog: AtlasCatalog): string[] {
  const tags = new Set<string>()
  for (const c of catalog.components) for (const t of c.tags ?? []) tags.add(t)
  return [...tags].sort()
}

/**
 * One component, prescriptive: exactly what to pass, which values are allowed,
 * and a known-good example WHEN one has actually been verified.
 */
export function renderComponent(catalog: AtlasCatalog, name: string): string {
  const component = catalog.components.find((c) => c.name === name)
  if (!component) {
    const names = catalog.components.map((c) => c.name)
    const near = names.filter((n) => n.toLowerCase().includes(name.toLowerCase())).slice(0, 5)
    return (
      `No component named "${name}" in the catalog.` +
      (near.length > 0 ? ` Did you mean: ${near.join(', ')}?` : ` Known: ${names.slice(0, 20).join(', ')}`)
    )
  }

  const controls = component.controls ?? []
  const required = controls.filter((c) => c.required)
  const optional = controls.filter((c) => !c.required)
  const reactive = controls.filter((c) => c.reactive).map((c) => c.name)

  const lines = [`# ${component.name}`]
  if (component.summary) lines.push(component.summary)
  if ((component.tags ?? []).length > 0) lines.push(`tags: ${(component.tags ?? []).join(', ')}`)
  if (component.source) lines.push(`source: ${component.source}`)
  lines.push('')
  if (required.length > 0) lines.push(`required: ${required.map(formatControl).join(', ')}`)
  if (optional.length > 0) lines.push(`optional: ${optional.map(formatControl).join(', ')}`)
  if (reactive.length > 0) {
    lines.push(`reactive (pass a signal accessor, not a value): ${reactive.join(', ')}`)
  }

  const scenarios = component.scenarios ?? []
  const withArgs = scenarios.filter((s) => Object.keys(s.args ?? {}).length > 0)
  const verified = withArgs.find(isVerified)

  lines.push('')
  if (verified) {
    lines.push(`correct (verified): ${JSON.stringify(verified.args)}`)
  } else {
    const candidate = withArgs.find((s) => !wasChecked(s))
    if (candidate) {
      // Deliberately weaker wording. Offering the args is useful; calling them
      // correct when nothing checked them is the claim that must not be made.
      lines.push(`example (UNVERIFIED — no check has run on this): ${JSON.stringify(candidate.args)}`)
    } else {
      lines.push('No scenario with props is available for this component.')
    }
  }

  for (const s of scenarios) {
    if (!wasChecked(s) || s.verify?.ok !== false) continue
    const findings = collectFindings(s.verify)
    if (findings) lines.push(`avoid: "${s.name}" — ${findings}`)
  }

  return lines.join('\n')
}

function collectFindings(verify: AtlasVerdict | undefined): string {
  if (!verify) return ''
  const out: string[] = []
  // Every check on the verdict, read from the OBJECT rather than a hand-written
  // list. The list here named five checks and never learned about `ssrParity`,
  // so a hydration failure was recorded in the catalog and then dropped on its
  // way to the agent — the one surface where a missing failure is most costly.
  // Reading the keys off the verdict cannot go stale.
  for (const key of Object.keys(verify)) {
    if (key === 'ok' || key === 'checked') continue
    const check = (verify as unknown as Record<string, AtlasVerifyCheck | undefined>)[key]
    if (check?.status !== 'fail' || !check.findings) continue
    // The FIX travels with the finding, so an agent gets the actionable half
    // and not only the diagnosis.
    out.push(...check.findings.map((f) => (f.fix ? `${f.message} → ${f.fix}` : f.message)))
  }
  return out.join('; ')
}

/** What to say when there is no catalog — actionable, never a fabricated answer. */
export const MISSING_CATALOG_MESSAGE =
  `No \`${CATALOG_FILENAME}\` found in this project (searched upward from the ` +
  `working directory).\n\n` +
  `Atlas builds it by scanning your components:\n\n` +
  '  bunx atlas scan\n\n' +
  `That writes \`${CATALOG_FILENAME}\` plus \`atlas-agent-guide.md\`. Re-run this ` +
  `tool afterwards.\n\n` +
  `Returning nothing rather than guessing: the point of the catalog is that its ` +
  `prop names and values are read from your real components, so an invented answer ` +
  `would defeat it.`
