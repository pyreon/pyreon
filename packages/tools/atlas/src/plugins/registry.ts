/**
 * The plugin registry — composes a set of plugins into the four pipeline
 * stages. `createAtlas` drives it; it is also usable directly for tests or
 * bespoke pipelines.
 */
import type {
  ComponentIntelligence,
  VerifyCheck,
  VerifyVerdict,
} from '../core'
import type {
  AtlasPlugin,
  DecorateContext,
  DiscoverContext,
  GraphContext,
  VerifyContext,
} from './types'

const SKIP: VerifyCheck = { status: 'skip' }

/**
 * Why a check did not run.
 *
 * A bare `skip` is three different situations wearing one label: this check
 * cannot run here, this check needs a different command, or nothing has looked
 * yet. A reader cannot tell which — so "2 of 5 checks skipped" reads as a hole
 * in the tool when it may be a command they have not run, or a check that does
 * not apply to their component.
 *
 * Saying which is the same honesty rule `ok`/`checked` already follows: report
 * what was established, and be specific about what was not.
 */
export const SKIP_REASON = {
  /** Measured in a real browser; `atlas scan` cannot do it in Node. */
  browserOnly:
    'browser-only — run `atlas verify-browser` to measure this (a Node scan cannot)',
  /** Nothing has examined this scenario at all. */
  notRun: 'not run — no plugin claimed this check',
} as const

/** A skip that says why. */
export function skipped(reason: string): VerifyCheck {
  return { status: 'skip', findings: [reason] }
}

/**
 * A verdict with every check skipped — the neutral element for merging.
 *
 * It is NOT `ok`. Nothing has run, so there is nothing to vouch for; claiming
 * `ok` here is what made an unverified scenario read as a passing one all the
 * way out to the agent guide.
 *
 * The two browser-measured checks carry their reason from the start, so a
 * catalog produced by `atlas scan` alone explains its own gaps rather than
 * presenting them as unexplained absence.
 */
export function emptyVerdict(): VerifyVerdict {
  return {
    ok: false,
    checked: 0,
    a11y: SKIP,
    interaction: SKIP,
    reactivityCoverage: skipped(SKIP_REASON.browserOnly),
    leak: SKIP,
    snapshot: skipped(SKIP_REASON.browserOnly),
  }
}

const CHECK_KEYS = ['a11y', 'interaction', 'reactivityCoverage', 'leak', 'snapshot'] as const

/** Merge a plugin's partial verdict onto an accumulator (checks only). */
function mergeVerdict(base: VerifyVerdict, partial: Partial<VerifyVerdict>): VerifyVerdict {
  const next: VerifyVerdict = { ...base }
  for (const key of CHECK_KEYS) {
    const check = partial[key]
    if (check !== undefined) next[key] = check
  }
  // Both fields are DERIVED, never taken from a plugin: a plugin owns its own
  // check, not the verdict. `ok` requires evidence — at least one check ran and
  // none failed — so "nothing examined this" can never present as "clean".
  next.checked = CHECK_KEYS.filter((key) => next[key].status !== 'skip').length
  next.ok = next.checked > 0 && CHECK_KEYS.every((key) => next[key].status !== 'fail')
  return next
}

export interface PluginRegistry {
  readonly plugins: readonly AtlasPlugin[]
  runDiscover(ctx: DiscoverContext): Promise<ComponentIntelligence[]>
  runDecorate(ci: ComponentIntelligence, ctx: DecorateContext): Promise<ComponentIntelligence>
  runVerify(ctx: VerifyContext): Promise<VerifyVerdict>
  runGraph(ctx: GraphContext): Promise<void>
}

export function createPluginRegistry(plugins: readonly AtlasPlugin[]): PluginRegistry {
  return {
    plugins,
    async runDiscover(ctx) {
      const out: ComponentIntelligence[] = []
      for (const plugin of plugins) {
        if (plugin.discover) out.push(...(await plugin.discover(ctx)))
      }
      return out
    },
    async runDecorate(ci, ctx) {
      let current = ci
      for (const plugin of plugins) {
        if (plugin.decorate) current = await plugin.decorate(current, ctx)
      }
      return current
    },
    async runVerify(ctx) {
      let verdict = emptyVerdict()
      for (const plugin of plugins) {
        if (plugin.verify) verdict = mergeVerdict(verdict, await plugin.verify(ctx))
      }
      return verdict
    },
    async runGraph(ctx) {
      for (const plugin of plugins) {
        if (plugin.graph) await plugin.graph(ctx)
      }
    },
  }
}
