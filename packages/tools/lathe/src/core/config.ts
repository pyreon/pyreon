/**
 * Lathe's configuration.
 *
 * Mirrors `AtlasSection` / `LoomSection` in `@pyreon/config` so a project
 * configures every Pyreon tool in one `pyreon.config.ts`.
 */

/** Which emitters run. Omitted means "the sensible default set". */
export type PluginName =
  | 'types'
  | 'schemas'
  | 'client'
  | 'queries'
  | 'mocks'
  | 'components'
  | 'atlas'

export const ALL_PLUGINS: readonly PluginName[] = [
  'types',
  'schemas',
  'client',
  'queries',
  'mocks',
  'components',
  'atlas',
]

export const DEFAULT_PLUGINS: readonly PluginName[] = ['schemas', 'client', 'queries']

/**
 * One generated client. Every field a single-project config takes, plus a name.
 *
 * Named after `@pyreon/atlas`'s `projects` for the same reason it has one: a
 * monorepo routinely has several APIs, and pointing one tool run at each of
 * them beats running the tool N times with N config files that drift apart.
 */
export interface LatheProject extends Omit<LatheSection, 'projects'> {
  /** Identifies the project in the report and in error messages. */
  name: string
  /** Required per project - there is no single top-level spec to fall back on. */
  input: string
}

export interface LatheSection {
  /**
   * Several specs in one run, each with its own output and target.
   *
   * When present, the top-level `input`/`output` are IGNORED - a config that
   * silently generated BOTH would produce output nobody asked for. Fields not
   * set on a project fall back to the top-level value, so shared settings
   * (`target`, `plugins`) are written once.
   */
  projects?: readonly LatheProject[]

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
  /** Project name, or `''` for a single-project config. */
  name: string
  input: string
  output: string
  target: 'web' | 'multiplatform'
  plugins: readonly PluginName[]
  baseUrl?: string | undefined
  strictNative: boolean
}

/**
 * Resolve every project this config describes.
 *
 * Always a LIST, so the caller has one code path. A single-project config
 * resolves to a one-element list rather than a special case.
 */
export function resolveProjects(section: LatheSection | undefined): ResolvedConfig[] {
  const projects = section?.projects
  if (!projects || projects.length === 0) return [resolveConfig(section)]

  const seen = new Set<string>()
  return projects.map((p, i) => {
    if (!p.name) {
      throw new Error(
        `[Pyreon] lathe: lathe.projects[${i}] has no \`name\`. It identifies the project in the report and in errors.`,
      )
    }
    if (seen.has(p.name)) {
      throw new Error(
        `[Pyreon] lathe: two projects are both named \`${p.name}\`. Names must be unique - they key the report.`,
      )
    }
    seen.add(p.name)
    // Project fields win; anything absent falls back to the top level, so
    // `target` and `plugins` are written once and shared.
    // `projects` is dropped rather than set to undefined:
    // `exactOptionalPropertyTypes` treats `{ projects: undefined }` and an
    // absent key as different types, and only the absent key is legal here.
    const { projects: _drop, ...base } = { ...section, ...p }
    return { ...resolveConfig(base), name: p.name }
  })
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
    name: '',
    input,
    output: section?.output ?? './src/gen',
    target: section?.target ?? 'web',
    plugins,
    baseUrl: section?.baseUrl,
    strictNative: section?.strictNative ?? false,
  }
}
