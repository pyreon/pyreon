/**
 * Lathe's configuration.
 *
 * Mirrors `AtlasSection` / `LoomSection` in `@pyreon/config` so a project
 * configures every Pyreon tool in one `pyreon.config.ts`.
 */

import {
  ALL_CLIENTS,
  ALL_RESPONSE_VALIDATION,
  reachesNative,
  type ClientName,
  type ResponseValidation,
} from '../emit/client-runtime'
import { ALL_VALIDATORS, type ValidatorName } from '../emit/validator'
import type { LatheNaming, LatheOperationSettings } from './customize'
import type { LatheFormatter } from './format'
import type { LatheSpecPatch } from './patch'
import { isLathePlugin, type LathePlugin } from './plugin'
import type { LatheFilters } from './select'

export type { ClientName, ResponseValidation, ValidatorName }

/** Which emitters run. Omitted means "the sensible default set". */
export type PluginName =
  | 'types'
  | 'schemas'
  | 'client'
  | 'queries'
  | 'mocks'
  | 'faker'
  | 'components'
  | 'atlas'
  | 'docs'

export const ALL_PLUGINS: readonly PluginName[] = [
  'types',
  'schemas',
  'client',
  'queries',
  'mocks',
  'faker',
  'components',
  'atlas',
  'docs',
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
  // The factories exist to produce data the SCHEMA accepts -- constraints
  // choose their generators. Without schemas there is nothing for them to be
  // correct against, and no round-trip test that could prove they are.
  faker: ['schemas'],
  components: ['queries'],
  // Scenarios key the preview components; the wrapper installs the mocks.
  atlas: ['components', 'mocks'],
  // Markdown rendered from the IR. It imports nothing and is imported by
  // nothing, so it is the one plugin with no edges at all.
  docs: [],
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

  /**
   * Path to the OpenAPI 3.x document (`.json`, `.yaml`, `.yml`).
   *
   * Relative to the config FILE when read from `pyreon.config.ts`; a path given
   * on the command line is relative to the working directory, like any other
   * CLI argument.
   */
  input?: string
  /** Output directory. Relative to the config file, like `input`. Default `./src/gen`. */
  output?: string
  /**
   * Where `lathe pull` fetches the spec from: an http(s) URL, written to
   * `input`. With `projects`, `lathe pull` pulls every project that sets one.
   */
  source?: string

  /**
   * `web` emits the idiomatic multi-file layout.
   *
   * `multiplatform` ALSO emits one self-contained module per tag, shaped for
   * PMTC, and verifies that those modules actually lower. It is additive: the
   * web output is unchanged, so turning it on can never make the web build
   * worse.
   */
  target?: 'web' | 'multiplatform'
  /**
   * Emitters to run: built-in names, and third-party plugins made with
   * `definePlugin` (see {@link LathePlugin}). Built-ins run first, then
   * plugins in the order listed.
   *
   * @example
   * ```ts
   * import { mswHandlers } from './lathe-msw'
   * export default defineConfig({ lathe: { input: './openapi.yaml', plugins: ['schemas', 'client', mswHandlers()] } })
   * ```
   */
  plugins?: readonly (PluginName | LathePlugin)[]
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
   * What the generated client does with a response that does not match its
   * schema. `strict` (the default) rejects; `warn` logs and passes the raw body
   * through, which is the usual choice in production when a backend may drift;
   * `off` skips validation, which also skips its cost on large list responses.
   *
   * Web client only. The native modules decode into typed structs, which is
   * validation in itself and is not configurable.
   *
   * @example
   * ```ts
   * export default { lathe: { input: './openapi.yaml', responseValidation: 'warn' } }
   * ```
   */
  responseValidation?: ResponseValidation
  /**
   * How to page through operations, keyed by the GENERATED operation name
   * (the `endpoints` export). Declared, never guessed — each entry emits a
   * `use<Op>Infinite` hook and a `<op>InfiniteOptions` factory. Same shape as
   * the `x-pyreon-pagination` spec extension, which a config entry overrides.
   *
   * ```ts
   * pagination: {
   *   listCustomers: { kind: 'lastItem', param: 'starting_after', items: 'data', field: 'id', hasMore: 'has_more' },
   *   listEvents: { kind: 'cursor', param: 'cursor', next: 'meta.next_cursor' },
   * }
   * ```
   */
  pagination?: Readonly<Record<string, PaginationConfig>>
  /**
   * Per-operation settings, keyed by the generated endpoint name OR the
   * spec's `operationId`. Each entry may rename the hook, turn it off, set the
   * operation's own response validation, or declare its pagination (the same
   * entry `pagination` takes — use one or the other for an operation).
   *
   * @example
   * ```ts
   * operations: {
   *   listEvents: { responseValidation: 'off', pagination: { kind: 'cursor', param: 'cursor', next: 'next' } },
   *   getPetById: { hook: 'usePet' },
   *   deleteAccount: { hook: false }, // endpoint only — no mutation hook
   * }
   * ```
   */
  operations?: Readonly<Record<string, LatheOperationSettings<PaginationConfig>>>
  /**
   * Generate a SUBSET of the spec. `include` keeps operations some matcher
   * selects, then `exclude` drops any a matcher selects; models only the
   * dropped operations used are dropped too (`models: 'all'` keeps them).
   * A matcher that selects nothing is an error — it is almost always a typo.
   *
   * @example
   * ```ts
   * filters: {
   *   include: [{ tag: ['pets', 'store'] }, { path: '/users/**', method: 'get' }],
   *   exclude: { operationId: '*Deprecated' },
   * }
   * ```
   */
  filters?: LatheFilters
  /**
   * Corrections applied to the spec BEFORE it is read — RFC 6902 `add` /
   * `replace` / `remove` at an RFC 6901 pointer. A note's `at` (`#/paths/…`)
   * can be pasted in as the path. A patch whose target no longer exists FAILS
   * the run: the spec changed under it and it needs another look.
   *
   * @example
   * ```ts
   * patches: [
   *   { op: 'add', path: '/paths/~1pets/get/operationId', value: 'listPets' },
   *   { op: 'replace', path: '/components/schemas/Pet/properties/tag/nullable', value: true },
   * ]
   * ```
   */
  patches?: readonly LatheSpecPatch[]
  /**
   * Rename what Lathe generates. Each function receives Lathe's own choice as
   * `default`, so returning it keeps it. Results are checked: an invalid name
   * or two things mapped to one name is an error naming both.
   *
   * @example
   * ```ts
   * naming: {
   *   operation: ({ default: name }) => name.replace(/^v1/, ''),
   *   model: ({ default: name }) => `${name}Dto`,
   *   file: ({ default: stem }) => `${stem}-api`,
   *   hook: ({ default: name, kind }) => (kind === 'mutation' ? false : name),
   * }
   * ```
   */
  naming?: LatheNaming
  /**
   * Format every generated source file before it is written AND before
   * `lathe check` compares — so committed, formatted output is not reported
   * stale. Receives the file's path so a formatter can pick its parser.
   * Lathe's own bookkeeping (`lathe-manifest.json`, `api-surface.json`) is
   * never passed. Must be deterministic, like everything else here.
   *
   * @example
   * ```ts
   * import { format as prettier } from 'prettier'
   * export default defineConfig({
   *   lathe: { input: './openapi.yaml', format: (code, path) => prettier(code, { filepath: path }) },
   * })
   * ```
   */
  format?: LatheFormatter
  /**
   * Fail the run when a generated native module does not lower.
   *
   * Off by default: a spec is usually partly un-lowerable and that is fine and
   * expected. Turn it on in CI for an app that means to ship on iOS/Android,
   * where a silent regression to web-only is a real defect.
   */
  strictNative?: boolean
}

/** One operation's pagination declaration — see `LatheSection.pagination`. */
export type PaginationConfig =
  | { kind: 'cursor'; param: string; next: string; hasMore?: string }
  | { kind: 'lastItem'; param: string; items?: string; field: string; hasMore?: string }
  | { kind: 'offset' | 'page'; param: string; items?: string; hasMore?: string; initial?: number }

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
  pagination?: Readonly<Record<string, PaginationConfig>> | undefined
  strictNative: boolean
  responseValidation: ResponseValidation
  /** Third-party plugins, in declaration order. Built-ins are in `plugins`. */
  customPlugins: readonly LathePlugin[]
  operations?: Readonly<Record<string, LatheOperationSettings<PaginationConfig>>> | undefined
  filters?: LatheFilters | undefined
  patches?: readonly LatheSpecPatch[] | undefined
  naming?: LatheNaming | undefined
  format?: LatheFormatter | undefined
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
  const entries = section?.plugins ?? DEFAULT_PLUGINS
  const plugins: PluginName[] = []
  const customPlugins: LathePlugin[] = []
  for (const p of entries) {
    if (typeof p === 'string') {
      if (!ALL_PLUGINS.includes(p)) {
        throw new Error(
          `[Pyreon] lathe: unknown plugin \`${p}\`. Known: ${ALL_PLUGINS.join(', ')}.`,
        )
      }
      plugins.push(p)
      continue
    }
    // A plugin object must come from `definePlugin`, which validated its
    // shape; a bare object literal with a typo'd hook would otherwise run
    // nothing, silently.
    if (!isLathePlugin(p)) {
      throw new Error(
        `[Pyreon] lathe: a \`plugins\` entry is neither a built-in name nor a plugin. Create plugins with \`definePlugin({ name, … })\` from '@pyreon/lathe'.`,
      )
    }
    if ((ALL_PLUGINS as readonly string[]).includes(p.name)) {
      throw new Error(`[Pyreon] lathe: plugin \`${p.name}\` has the name of a built-in plugin. Choose another name.`)
    }
    if (customPlugins.some((c) => c.name === p.name)) {
      throw new Error(`[Pyreon] lathe: two plugins are named \`${p.name}\`. Names must be unique — they attribute errors.`)
    }
    customPlugins.push(p)
    for (const dep of p.requires ?? []) {
      if (!ALL_PLUGINS.includes(dep)) {
        throw new Error(`[Pyreon] lathe: plugin \`${p.name}\` requires \`${String(dep)}\`, which is not a built-in plugin. Known: ${ALL_PLUGINS.join(', ')}.`)
      }
    }
  }
  if (section?.format !== undefined && typeof section.format !== 'function') {
    throw new Error('[Pyreon] lathe: `format` must be a function `(code, path) => string | Promise<string>`.')
  }
  const required = customPlugins.flatMap((p) => p.requires ?? [])
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
  const responseValidation = section?.responseValidation ?? 'strict'
  if (!ALL_RESPONSE_VALIDATION.includes(responseValidation)) {
    throw new Error(
      `[Pyreon] lathe: unknown responseValidation \`${String(responseValidation)}\`. Known: ${ALL_RESPONSE_VALIDATION.join(', ')}.`,
    )
  }
  const target = section?.target ?? 'web'
  // Validated like the others: a config typo (`target: 'native'`) used to be
  // treated as `web` by every `=== 'multiplatform'` check downstream, so the
  // native modules the author asked for were silently never generated.
  if (target !== 'web' && target !== 'multiplatform') {
    throw new Error(
      `[Pyreon] lathe: unknown target \`${String(target)}\`. Known: web, multiplatform.`,
    )
  }
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
    plugins: expandPlugins([...plugins, ...required]),
    client,
    validator,
    baseUrl: section?.baseUrl,
    pagination: section?.pagination,
    strictNative: section?.strictNative ?? false,
    responseValidation,
    customPlugins,
    operations: section?.operations,
    filters: section?.filters,
    patches: section?.patches,
    naming: section?.naming,
    format: section?.format,
  }
}
