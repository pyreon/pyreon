/**
 * `pyreon.config.ts` — ONE config file for the whole ecosystem.
 *
 * ── The problem ───────────────────────────────────────────────────────────
 *
 * Every tool grew its own file: `atlas.config.ts`, `.pyreonlintrc.json`, a
 * `zero()` call in `vite.config.ts`, options passed to `loom`. Each is small
 * and defensible on its own; together they are four places to look, four
 * formats to remember, and four things to keep in sync when a project moves a
 * directory. A single config with a key per package is one place to look and
 * one thing to type — and the tool that reads a key is the tool that owns its
 * meaning, so nothing becomes a god object.
 *
 * ```ts
 * import { defineConfig } from '@pyreon/config'
 *
 * export default defineConfig({
 *   atlas: {
 *     title: 'Acme Design System',
 *     projects: [{ name: 'Core', dir: 'packages/core/src' }],
 *   },
 * })
 * ```
 *
 * ── Why the type has few keys ─────────────────────────────────────────────
 *
 * A key appears here ONLY when a package actually reads it. A config surface
 * that advertises options nothing consumes is the typed-but-unimplemented
 * class this repo runs a CI gate against (`audit-types`): it typechecks, it
 * autocompletes, and it silently does nothing — which is worse than not
 * offering it, because the user has no way to tell.
 *
 * So this grows as packages are wired, one at a time, each in the change that
 * makes it real. `unknownKeys` below is how a project can still carry config
 * for a tool that has not landed yet without losing type safety on the rest.
 */

/**
 * Loom's configuration — see `@pyreon/loom`'s README for the field docs.
 *
 * Every key here has a reader in `@pyreon/loom`; the root `package.json`'s
 * `loom` key remains supported and WINS per-key, matching how atlas lets
 * `atlas.config.*` beat this file. A project that has both has almost
 * certainly just started migrating, and having the general file silently
 * override the specific one mid-migration is the worst possible ordering.
 */
export interface LoomSection {
  /**
   * Package-relative globs that are NOT shipping source — build-time codegen,
   * manifest files, generators. Segment-wise: `*` within one segment, `**` any
   * depth. A declared path still counts as USED; it stops counting as SHIPPED.
   */
  devPaths?: string[]
  /**
   * Suppressions. `reason` is mandatory — an unexplained suppression is a lie
   * waiting to age — and a match is downgraded to `info` with the reason
   * attached rather than dropped, so the report still shows what was waved
   * through.
   */
  ignore?: { pkg?: string; dep?: string; code?: string; reason: string }[]
  /** Exit non-zero on warnings too, without passing `--strict` at every call site. */
  strict?: boolean
  /**
   * Per-code severity overrides, keyed by issue code (`unused-dep`,
   * `version-drift`, …). The escape hatch for adopting loom on an existing
   * repo: raise a code to `error` once it is clean, or lower one to `info`
   * while it is being burned down — the ratchet this repo already runs its
   * lint backlogs on. An unknown code is a loud error, not a silent no-op.
   */
  severity?: Record<string, 'error' | 'warning' | 'info'>
}

/** Atlas's configuration — see `@pyreon/atlas`'s `AtlasConfig` for the field docs. */
export interface AtlasSection {
  title?: string
  wrapper?: (props: { children?: unknown }) => unknown
  theme?: unknown
  presets?: unknown
  pages?: Record<string, { title?: string; group?: string; order?: number; summary?: string }>
  projects?: readonly { name: string; dir: string }[]
  scenarios?: Record<
    string,
    readonly { name: string; args?: Record<string, unknown>; play?: unknown }[]
  >
}


/**
 * Lathe's configuration — see `@pyreon/lathe`'s `LatheSection` for field docs.
 *
 * Kept structurally identical to the package's own type rather than imported:
 * `@pyreon/config` must stay dependency-free so every tool can read it without
 * pulling the others in. "Identical" is ENFORCED, not hoped for:
 * `@pyreon/lathe`'s `config-section-parity` test fails the typecheck when the
 * two diverge in either direction. It had drifted before that test existed --
 * `client` and `validator` were missing here, and `plugins` was `string[]`, so
 * a typo such as `'querys'` typechecked and failed only at run time.
 *
 * Relative paths (`input`, `output`) resolve against the directory of the
 * config FILE, not the shell's working directory, so `lathe` behaves the same
 * from any subdirectory of the project.
 */
export interface LatheSection {
  /**
   * Several specs in one run, each with its own output and target.
   *
   * When present, the top-level `input`/`output` are ignored; fields a project
   * omits fall back to the top-level value, so shared settings are written once.
   */
  projects?: readonly LatheProjectSection[]
  /** Path to the OpenAPI 3.x document (`.json`, `.yaml`, `.yml`), relative to the config file. */
  input?: string
  /** Output directory, relative to the config file. Default `./src/gen`. */
  output?: string
  /** Where `lathe pull` fetches the spec from — an http(s) URL, written to `input`. */
  source?: string
  /**
   * `web` emits the idiomatic multi-file layout; `multiplatform` ALSO emits
   * one self-contained module per tag, shaped for the native compiler, and
   * verifies that those modules actually lower.
   */
  target?: 'web' | 'multiplatform'
  /** Emitters to run. Default `['schemas', 'client', 'queries']`. */
  plugins?: readonly LathePluginName[]
  /** The generated client's HTTP runtime. Only `pyreon` reaches native. Default `pyreon`. */
  client?: 'pyreon' | 'fetch' | 'axios' | 'ky'
  /** The generated schemas' library. Default `pyreon` (`@pyreon/validate`). */
  validator?: 'pyreon' | 'zod'
  /** Overrides the spec's `servers[0].url` — must be literal to reach native. */
  baseUrl?: string
  /**
   * Declared pagination per generated operation name — emits `use<Op>Infinite`
   * hooks. See `@pyreon/lathe`'s `PaginationConfig`.
   */
  pagination?: Readonly<
    Record<
      string,
      | { kind: 'cursor'; param: string; next: string; hasMore?: string }
      | { kind: 'lastItem'; param: string; items?: string; field: string; hasMore?: string }
      | { kind: 'offset' | 'page'; param: string; items?: string; hasMore?: string; initial?: number }
    >
  >
  /**
   * Streaming responses per generated operation name — emits `<op>Stream` and
   * `use<Op>Stream`. See `@pyreon/lathe`'s `StreamConfig`.
   */
  streams?: Readonly<Record<string, { format?: 'sse' | 'ndjson'; event?: string; data?: 'json' | 'text' }>>
  /** Exit non-zero when a generated native module does not lower. */
  strictNative?: boolean
  /**
   * What the generated web client does with a response that does not match
   * its schema: `strict` (default) rejects, `warn` logs and passes the raw
   * body through, `off` skips validation.
   */
  responseValidation?: 'strict' | 'warn' | 'off'
}

/** One entry of {@link LatheSection.projects}. */
export interface LatheProjectSection extends Omit<LatheSection, 'projects'> {
  /** Identifies the project in the report and in errors. */
  name: string
  /** Required per project — there is no single top-level spec to fall back on. */
  input: string
}

/** A Lathe emitter. */
export type LathePluginName =
  | 'types'
  | 'schemas'
  | 'client'
  | 'queries'
  | 'mocks'
  | 'faker'
  | 'components'
  | 'atlas'
  | 'docs'

/**
 * The whole-ecosystem config.
 *
 * Indexed as well as keyed: a project may configure a tool this version does
 * not know about (a newer package, a plugin), and rejecting that at the type
 * level would force everyone to upgrade in lockstep. Unknown keys are carried
 * through untouched and are simply not read.
 */
export interface PyreonConfig {
  /** `@pyreon/atlas` — the component workbench. */
  atlas?: AtlasSection
  /** `@pyreon/loom` — the dependency observatory. */
  loom?: LoomSection
  /** `@pyreon/lathe` — the spec-to-client generator. */
  lathe?: LatheSection
  /** Config for a tool this version does not know about. Carried, never read. */
  [tool: string]: unknown
}

/**
 * Identity, for the types and the editor.
 *
 * Exists so a config file gets completion and checking without the author
 * writing `satisfies PyreonConfig` by hand — the same reason every config-
 * driven tool ships one.
 */
export function defineConfig(config: PyreonConfig): PyreonConfig {
  return config
}

/** Filenames tried, in order. */
export const CONFIG_FILENAMES = [
  'pyreon.config.ts',
  'pyreon.config.tsx',
  'pyreon.config.mjs',
  'pyreon.config.js',
] as const

/**
 * Read one tool's section out of a loaded config module.
 *
 * Accepts the default export or a named one, matching how every Pyreon config
 * loader already behaves — guessing wrong between them is a config that is
 * silently ignored, which is the failure this whole file exists to reduce.
 */
export function sectionFrom(module: Record<string, unknown>, tool: string): unknown {
  const fromDefault = (module.default ?? {}) as Record<string, unknown>
  return module[tool] ?? fromDefault[tool]
}
