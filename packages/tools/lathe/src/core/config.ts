/**
 * Lathe's configuration.
 *
 * Mirrors `AtlasSection` / `LoomSection` in `@pyreon/config` so a project
 * configures every Pyreon tool in one `pyreon.config.ts`.
 */

import { ALL_CLIENTS, reachesNative, type ClientName } from '../emit/client-runtime'
import { ALL_VALIDATORS, type ValidatorName } from '../emit/validator'

export type { ClientName, ValidatorName }

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
 * What each emitter's OUTPUT imports.
 *
 * These are not preferences, they are import edges in the emitted code:
 * `queries/*.ts` imports from `endpoints/*.ts`, which imports the client;
 * `components.tsx` imports the hooks; `mocks.ts` imports the client's
 * transport seam. Selecting a plugin without what it imports produced files
 * referencing modules that were never written -- output that looks complete
 * and does not resolve.
 *
 * Resolved rather than REFUSED: someone asking for `components` wants
 * browsable previews, and the hooks they are built from are an implementation
 * detail of that answer. The report says what came along.
 */
export const PLUGIN_REQUIRES: Readonly<Record<PluginName, readonly PluginName[]>> = {
  types: [],
  schemas: [],
  // An endpoint's `{ response }` clause names a schema.
  client: ['schemas'],
  queries: ['client'],
  mocks: ['client'],
  components: ['queries'],
  // Scenarios key the preview components; the wrapper installs the mocks.
  atlas: ['components', 'mocks'],
}

/**
 * Expand a selection to include everything its output imports.
 *
 * Order-preserving and idempotent, so the emitted file set is stable: an
 * unstable plugin order would reorder the report and, worse, the barrel.
 */
export function expandPlugins(selected: readonly PluginName[]): PluginName[] {
  const out: PluginName[] = []
  const seen = new Set<PluginName>()
  const visit = (name: PluginName): void => {
    if (seen.has(name)) return
    seen.add(name)
    for (const dep of PLUGIN_REQUIRES[name]) visit(dep)
    out.push(name)
  }
  for (const name of selected) visit(name)
  return out
}

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
  /**
   * Which HTTP runtime the generated client is built on.
   *
   * `pyreon` (the default) is the only one that reaches native: PMTC
   * recognises `createHttp` + `api.endpoint(...)` by name and lowers the pair
   * to a real `URLSession` / `OkHttp` call. The others emit a self-contained
   * endpoint factory over that library, satisfying the SAME seam — so every
   * other generated file is byte-identical whichever is chosen.
   */
  client?: ClientName
  /**
   * Which library the generated schemas are written in.
   *
   * `pyreon` (the default) emits `@pyreon/validate` `s.*`; `zod` emits `z.*`.
   * Both satisfy Standard Schema, so the endpoint layer accepts either without
   * knowing which was chosen.
   *
   * Both also reach native, through different doors and with DIFFERENT
   * coverage: PMTC reads `s.object({ … })` directly and reads zod only inside
   * `@pyreon/validation`'s `zodSchema(...)`. Measured against the real
   * compiler, the zod recogniser lowers strictly more — nested objects and
   * arrays of objects lower there and are dropped under `s.*`.
   */
  validator?: ValidatorName
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
  /**
   * Plugins the caller asked for, before dependency expansion.
   *
   * Kept so the report can show what came along rather than expanding
   * silently -- a file set larger than the one you selected is confusing
   * exactly once, and only if nobody says why.
   */
  requestedPlugins: readonly PluginName[]
  input: string
  output: string
  target: 'web' | 'multiplatform'
  plugins: readonly PluginName[]
  client: ClientName
  validator: ValidatorName
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
  const client = section?.client ?? 'pyreon'
  if (!ALL_CLIENTS.includes(client)) {
    throw new Error(
      `[Pyreon] lathe: unknown client \`${client}\`. Known: ${ALL_CLIENTS.join(', ')}.`,
    )
  }
  const validator = section?.validator ?? 'pyreon'
  if (!ALL_VALIDATORS.includes(validator)) {
    throw new Error(
      `[Pyreon] lathe: unknown validator \`${validator}\`. Known: ${ALL_VALIDATORS.join(', ')}.`,
    )
  }
  const target = section?.target ?? 'web'
  // REFUSED rather than silently downgraded. `multiplatform` exists to prove
  // the generated modules lower, and PMTC recognises `createHttp` by NAME — an
  // axios instance is an ordinary import it has never heard of. Emitting
  // native modules over one would produce exactly the silent regression to
  // web-only that this target was built to catch.
  if (target === 'multiplatform' && !reachesNative(client)) {
    throw new Error(
      `[Pyreon] lathe: \`target: 'multiplatform'\` needs \`client: 'pyreon'\`, but this config asks for \`${client}\`. ` +
        `PMTC lowers \`createHttp\` + \`api.endpoint(...)\` by name; it cannot see through ${client}. ` +
        `Use \`target: 'web'\` with ${client}, or \`client: 'pyreon'\` to reach iOS and Android.`,
    )
  }
  return {
    name: '',
    requestedPlugins: plugins,
    input,
    output: section?.output ?? './src/gen',
    target,
    plugins: expandPlugins(plugins),
    client,
    validator,
    baseUrl: section?.baseUrl,
    strictNative: section?.strictNative ?? false,
  }
}
