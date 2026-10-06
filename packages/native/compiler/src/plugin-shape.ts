import { NATIVE_COMPILER_PLUGIN_API_VERSION, SUPPORTED_PLUGIN_API_VERSIONS } from './plugin'

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim() !== '')

/**
 * The fields added after the first protocol cut. Shared by `createCompiler`
 * (which keeps its own older checks verbatim) and the CLI loader, so a plugin
 * that is malformed fails with the SAME message in both places.
 */
export function assertPluginExtensions(name: string, plugin: object): void {
  const { services, modules, requires, builtIn } = plugin as Record<string, unknown>
  if (services !== undefined) {
    if (!services || typeof services !== 'object' || Array.isArray(services)) {
      throw new Error(`[Pyreon] Plugin "${name}" services must be an object keyed by hook name.`)
    }
    for (const [hook, spec] of Object.entries(services)) {
      const entry = spec as { swift?: unknown; kotlin?: unknown } | null
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.swift !== 'string' ||
        !entry.swift.trim() ||
        !isStringArray(entry.kotlin) ||
        entry.kotlin.length === 0
      ) {
        throw new Error(
          `[Pyreon] Plugin "${name}" service "${hook}" needs a nonempty swift string and a nonempty kotlin string array.`,
        )
      }
    }
  }
  for (const [field, value] of [
    ['modules', modules],
    ['requires', requires],
  ] as const) {
    if (value !== undefined && !isStringArray(value)) {
      throw new Error(`[Pyreon] Plugin "${name}" ${field} must be an array of nonempty strings.`)
    }
  }
  if (builtIn !== undefined && typeof builtIn !== 'boolean') {
    throw new Error(`[Pyreon] Plugin "${name}" builtIn must be a boolean.`)
  }
}

/**
 * Full shape check for a plugin loaded from outside (a module's default
 * export). `createCompiler` repeats the cheap parts; this exists so the CLI can
 * reject a bad package plugin BEFORE building a compiler, naming the file.
 */
export function assertPluginShape(value: unknown): asserts value is {
  readonly name: string
  readonly apiVersion: typeof NATIVE_COMPILER_PLUGIN_API_VERSION
} {
  if (!value || typeof value !== 'object') {
    throw new Error('[Pyreon] A native compiler plugin must be an object (the default export).')
  }
  const { name, apiVersion, transformIR, prepareIR, backends } = value as Record<string, unknown>
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('[Pyreon] Every native compiler plugin needs a nonempty name.')
  }
  if (typeof apiVersion !== 'number' || !SUPPORTED_PLUGIN_API_VERSIONS.includes(apiVersion)) {
    throw new Error(
      `[Pyreon] Native compiler plugin "${name}" requires API ${String(apiVersion)}; this compiler supports API ${SUPPORTED_PLUGIN_API_VERSIONS.join(', ')}. Update the plugin and compiler together.`,
    )
  }
  for (const [phase, fn] of [
    ['transformIR', transformIR],
    ['prepareIR', prepareIR],
  ] as const) {
    if (fn !== undefined && typeof fn !== 'function') {
      throw new Error(`[Pyreon] Plugin "${name}" ${phase} must be a synchronous function.`)
    }
  }
  if (backends !== undefined && !Array.isArray(backends)) {
    throw new Error(`[Pyreon] Plugin "${name}" backends must be an array.`)
  }
  assertPluginExtensions(name, value)
}
