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
