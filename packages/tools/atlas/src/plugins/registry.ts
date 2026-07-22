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

/** A verdict with every check skipped — the neutral element for merging. */
export function emptyVerdict(): VerifyVerdict {
  return {
    ok: true,
    a11y: SKIP,
    interaction: SKIP,
    reactivityCoverage: SKIP,
    leak: SKIP,
    snapshot: SKIP,
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
  // `ok` is DERIVED, never taken from a plugin — a scenario is ok iff no check failed.
  next.ok = CHECK_KEYS.every((key) => next[key].status !== 'fail')
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
