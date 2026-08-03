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
