/**
 * `atlas check` — validate a proposed usage against the derived contract.
 *
 * Reads `atlas-catalog.json` rather than rescanning. Two reasons, both about
 * agreement: a check has to be instant to be used at all, and it must give the
 * SAME answer the workbench and the agent guide give. A rescan here could
 * disagree with the catalog an agent was handed moments earlier, which is the
 * one thing a guardrail may never do.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { ComponentIntelligence } from '../core'
import {
  ambiguousComponentMessage,
  formatUsage,
  resolveComponent,
  validateUsage,
} from '../core'

const CATALOG = 'atlas-catalog.json'

/** How far up to look for a catalog before giving up. */
const MAX_UPWARD_STEPS = 12

/**
 * Find the catalog, walking UP from `start`.
 *
 * A monorepo runs its scan at the root and its editors anywhere; requiring the
 * command to be run from the exact directory that holds the file would make it
 * useless from inside a package.
 */
export function findCatalog(start: string): string | undefined {
  let dir = resolve(start)
  for (let step = 0; step < MAX_UPWARD_STEPS; step += 1) {
    const candidate = join(dir, CATALOG)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

export interface CheckOptions {
  cwd?: string
  component: string
  /** JSON object of props. Omitted means "check nothing", which reports missing required props. */
  argsJson?: string
}

export type CheckResult =
  | { kind: 'ok'; ok: boolean; text: string }
  | { kind: 'no-catalog'; searched: string }
  | { kind: 'bad-json'; reason: string }
  | { kind: 'unknown-component'; message: string }

export function runCheck(options: CheckOptions): CheckResult {
  const cwd = resolve(options.cwd ?? '.')
  const catalogPath = findCatalog(cwd)
  if (!catalogPath) return { kind: 'no-catalog', searched: cwd }

  let components: ComponentIntelligence[]
  try {
    const parsed = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
      components?: ComponentIntelligence[]
    }
    components = parsed.components ?? []
  } catch (err) {
    return { kind: 'bad-json', reason: `${catalogPath} is not readable: ${String(err)}` }
  }

  // By identity KEY or unambiguous NAME — the same resolution every other
  // surface uses, so `Core/Button` works and a bare ambiguous `Button` refuses
  // rather than checking against whichever package happened to be first.
  const match = resolveComponent(components, options.component)
  if (!match.found) {
    if (match.ambiguous.length > 0) {
      return {
        kind: 'unknown-component',
        message: ambiguousComponentMessage(options.component, match.ambiguous),
      }
    }
    // Name the alternatives: a typo'd component name is the same class of
    // mistake as a typo'd prop, and the catalog knows every real one.
    const known = components
      .map((c) => c.name)
      .sort()
      .slice(0, 12)
    return {
      kind: 'unknown-component',
      message:
        `"${options.component}" is not in the catalog. ` +
        `Known: ${known.join(', ')}${components.length > known.length ? ', …' : ''}`,
    }
  }

  let args: Record<string, unknown> = {}
  if (options.argsJson !== undefined && options.argsJson.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(options.argsJson)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { kind: 'bad-json', reason: 'expected a JSON object of props' }
      }
      args = parsed as Record<string, unknown>
    } catch (err) {
      return { kind: 'bad-json', reason: err instanceof Error ? err.message : String(err) }
    }
  }

  const result = validateUsage(match.found, args)
  return { kind: 'ok', ok: result.ok, text: formatUsage(match.found.name, result) }
}
