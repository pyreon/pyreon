/**
 * Lathe's configuration.
 *
 * Mirrors `AtlasSection` / `LoomSection` in `@pyreon/config` so a project
 * configures every Pyreon tool in one `pyreon.config.ts`.
 */

/** Which emitters run. Omitted means "the sensible default set". */
export type PluginName = 'types' | 'schemas' | 'client' | 'queries' | 'mocks' | 'atlas'

export const ALL_PLUGINS: readonly PluginName[] = [
  'types',
  'schemas',
  'client',
  'queries',
  'mocks',
  'atlas',
]

export const DEFAULT_PLUGINS: readonly PluginName[] = ['schemas', 'client', 'queries']

export interface LatheSection {
  /** Path to the OpenAPI document (`.json`, `.yaml`, `.yml`). */
  input?: string
  /** Output directory, relative to the config file. */
  output?: string
  /**
   * `web` emits the idiomatic multi-file layout.
   *
   * `multiplatform` ALSO emits one self-contained module per tag, shaped for
   * PMTC, and verifies that those modules actually lower. It is additive: the
   * web output is unchanged, so turning it on can never make the web build
   * worse.
   */
  target?: 'web' | 'multiplatform'
  /** Emitters to run. */
  plugins?: readonly PluginName[]
  /** Overrides the spec's `servers[0].url` — must be a literal to reach native. */
  baseUrl?: string
  /**
   * Fail the run when a generated native module does not lower.
   *
   * Off by default: a spec is usually partly un-lowerable and that is fine and
   * expected. Turn it on in CI for an app that means to ship on iOS/Android,
   * where a silent regression to web-only is a real defect.
   */
  strictNative?: boolean
}

export interface ResolvedConfig {
  input: string
  output: string
  target: 'web' | 'multiplatform'
  plugins: readonly PluginName[]
  baseUrl?: string | undefined
  strictNative: boolean
}

/** Fill defaults. Throws with actionable text when a required field is absent. */
export function resolveConfig(section: LatheSection | undefined): ResolvedConfig {
  const input = section?.input
  if (!input) {
    throw new Error(
      '[Pyreon] lathe: no input spec. Set `lathe.input` in pyreon.config.ts, or pass one: `lathe generate ./openapi.yaml`.',
    )
  }
  const plugins = section?.plugins ?? DEFAULT_PLUGINS
  for (const p of plugins) {
    if (!ALL_PLUGINS.includes(p)) {
      throw new Error(
        `[Pyreon] lathe: unknown plugin \`${p}\`. Known: ${ALL_PLUGINS.join(', ')}.`,
      )
    }
  }
  return {
    input,
    output: section?.output ?? './src/gen',
    target: section?.target ?? 'web',
    plugins,
    baseUrl: section?.baseUrl,
    strictNative: section?.strictNative ?? false,
  }
}
