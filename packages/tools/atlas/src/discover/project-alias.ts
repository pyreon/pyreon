/**
 * The target project's `resolve.alias`, so an aliased import does not make the
 * workbench unusable.
 *
 * ── The failure ───────────────────────────────────────────────────────────
 *
 * Atlas creates its own Vite contexts with `configFile: false`, deliberately:
 * the project's config carries PLUGINS that Atlas must not double-apply (it
 * already runs the real `@pyreon/vite-plugin` itself, and applying a second
 * copy is how you get two compiler passes over the same JSX).
 *
 * But `configFile: false` throws out `resolve.alias` along with the plugins.
 * An app whose components import through its own `~/components/…` alias then
 * fails to load EVERY such component — and in the dev workbench the overlay
 * covers the page, so one aliased import makes the whole catalog unusable
 * rather than one card (#2744).
 *
 * ── Resolve-only, never plugins ───────────────────────────────────────────
 *
 * So this loads the project's config and takes `resolve.alias` and nothing
 * else. Not a config merge — an EXTRACTION. Plugins, server options, build
 * options and `optimizeDeps` are all left behind, because each of them is
 * something Atlas has already decided for itself and a merge would silently
 * override.
 *
 * `resolve.conditions` is deliberately NOT taken either: Atlas resolves
 * workspace packages through the `bun` condition on purpose (see
 * `workspaceResolvePlugin`), and inheriting the app's conditions would break
 * that for every `@pyreon/*` import — trading one broken import class for a
 * larger one.
 *
 * ── Failure is a warning, never a crash ───────────────────────────────────
 *
 * A project's vite config can throw on load: it may import plugins that are
 * not installed for this command, or read env the workbench does not set. That
 * must degrade to "no aliases discovered", because the alternative is that
 * `atlas dev` refuses to start over a config it only wanted one field from.
 */
import { resolve } from 'node:path'

/** The alias shapes Vite accepts, normalised to the array form it prefers. */
export type AliasEntry = { find: string | RegExp; replacement: string }

/** What `loadConfigFromFile` gives back, narrowed to what is read here. */
interface LoadedConfig {
  config?: {
    resolve?: {
      alias?: Record<string, string> | readonly AliasEntry[]
    }
  }
}

type ConfigLoader = (
  env: { command: 'serve' | 'build'; mode: string },
  configFile?: string,
  configRoot?: string,
) => Promise<LoadedConfig | null>

/**
 * Normalise Vite's two alias shapes into one.
 *
 * The object form (`{ '~': '/src' }`) and the array form
 * (`[{ find, replacement }]`) are both legal and both common; downstream code
 * should never have to branch on which one a project happened to write.
 *
 * Relative replacements are resolved against the project root here rather than
 * later — an alias is relative to the config that declared it, and Atlas's
 * Vite contexts may run with a different root.
 */
export function normalizeAlias(
  alias: Record<string, string> | readonly AliasEntry[] | undefined,
  root: string,
): AliasEntry[] {
  if (!alias) return []
  const abs = (replacement: string): string =>
    replacement.startsWith('.') ? resolve(root, replacement) : replacement
  if (Array.isArray(alias)) {
    return alias
      .filter((e): e is AliasEntry => Boolean(e) && typeof e.replacement === 'string')
      .map((e) => ({ find: e.find, replacement: abs(e.replacement) }))
  }
  return Object.entries(alias as Record<string, string>)
    .filter(([, v]) => typeof v === 'string')
    .map(([find, replacement]) => ({ find, replacement: abs(replacement) }))
}

export interface ProjectAliasResult {
  alias: AliasEntry[]
  /** Set when a config existed but could not be read — surfaced, not swallowed. */
  warning?: string
}

/**
 * Read `resolve.alias` out of the project's own Vite config.
 *
 * `loader` is injectable so this is testable without a real config file on
 * disk; the default is Vite's own `loadConfigFromFile`, which is the same
 * resolution Vite would perform, including finding `vite.config.{ts,js,mts,…}`.
 */
export async function projectAlias(
  root: string,
  loader?: ConfigLoader,
): Promise<ProjectAliasResult> {
  let load = loader
  if (!load) {
    try {
      const vite = (await import('vite')) as unknown as { loadConfigFromFile?: ConfigLoader }
      if (typeof vite.loadConfigFromFile !== 'function') return { alias: [] }
      load = vite.loadConfigFromFile
    } catch {
      // Vite is an optional peer for the scan path; no Vite, no aliases, and
      // nothing to warn about — the caller could not have used them anyway.
      return { alias: [] }
    }
  }

  try {
    // `serve` because the workbench is a dev server; a config that branches on
    // command should describe the same aliases either way, and asking for the
    // mode Atlas actually runs is the honest question.
    const loaded = await load({ command: 'serve', mode: 'development' }, undefined, root)
    if (!loaded?.config) return { alias: [] }
    return { alias: normalizeAlias(loaded.config.resolve?.alias, root) }
  } catch (error) {
    return {
      alias: [],
      warning:
        `could not read this project's vite config for resolve.alias ` +
        `(${error instanceof Error ? error.message : String(error)}). ` +
        `Aliased imports will fail to resolve — set \`alias\` in atlas.config.ts to fix it explicitly.`,
    }
  }
}

/**
 * The aliases Atlas should apply: the project's, with `atlas.config.ts`'s
 * `alias` layered on top.
 *
 * Explicit wins, and is appended LAST rather than merged by key: Vite matches
 * aliases in order, so a later entry cannot shadow an earlier one with the
 * same `find`. Prepending the explicit ones is what makes "explicit wins"
 * true rather than aspirational.
 */
export function mergeAlias(
  discovered: readonly AliasEntry[],
  explicit: readonly AliasEntry[],
): AliasEntry[] {
  return [...explicit, ...discovered]
}
