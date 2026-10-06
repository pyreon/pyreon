import { NATIVE_COMPILER_PLUGIN_API_VERSION, SUPPORTED_PLUGIN_API_VERSIONS } from './plugin'

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim() !== '')

function assertElementLowering(plugin: string, value: unknown): void {
  const lowering = value as Record<string, unknown> | null
  if (
    !lowering ||
    typeof lowering !== 'object' ||
    typeof lowering.module !== 'string' ||
    !lowering.module.trim() ||
    !isStringArray(lowering.tags) ||
    lowering.tags.length === 0
  ) {
    throw new Error(
      `[Pyreon] Plugin "${plugin}" element lowering needs a nonempty module string and a nonempty tags array of strings.`,
    )
  }
  const { retag, emit, styleBase } = lowering
  if (retag !== undefined && typeof retag !== 'function') {
    throw new Error(
      `[Pyreon] Plugin "${plugin}" element lowering for ${lowering.module} retag must be a function.`,
    )
  }
  if (emit !== undefined) {
    const targets = emit as Record<string, unknown> | null
    if (
      !targets ||
      typeof targets !== 'object' ||
      (targets.swift !== undefined && typeof targets.swift !== 'function') ||
      (targets.kotlin !== undefined && typeof targets.kotlin !== 'function')
    ) {
      throw new Error(
        `[Pyreon] Plugin "${plugin}" element lowering for ${lowering.module} emit must be an object with swift and/or kotlin functions.`,
      )
    }
  }
  if (retag === undefined && emit === undefined) {
    throw new Error(
      `[Pyreon] Plugin "${plugin}" element lowering for ${lowering.module} needs a retag or an emit — a lowering with neither claims tags and does nothing.`,
    )
  }
  if (styleBase !== undefined && typeof styleBase !== 'boolean') {
    throw new Error(
      `[Pyreon] Plugin "${plugin}" element lowering for ${lowering.module} styleBase must be a boolean.`,
    )
  }
}

/**
 * The fields added after the first protocol cut. Shared by `createCompiler`
 * (which keeps its own older checks verbatim) and the CLI loader, so a plugin
 * that is malformed fails with the SAME message in both places.
 */
export function assertPluginExtensions(name: string, plugin: object): void {
  const { services, elements, scopes, stubs, calls, decls, memberCalls, unlowered, runtimeTypes, refineParse, modules, requires, builtIn } = plugin as Record<
    string,
    unknown
  >
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
  if (elements !== undefined) {
    if (!Array.isArray(elements)) {
      throw new Error(`[Pyreon] Plugin "${name}" elements must be an array of element lowerings.`)
    }
    for (const entry of elements as unknown[]) assertElementLowering(name, entry)
  }
  if (scopes !== undefined) {
    if (!Array.isArray(scopes)) {
      throw new Error(`[Pyreon] Plugin "${name}" scopes must be an array of colour-scope providers.`)
    }
    for (const entry of scopes as unknown[]) {
      const provider = entry as Record<string, unknown> | null
      if (
        !provider ||
        typeof provider !== 'object' ||
        typeof provider.module !== 'string' ||
        !provider.module.trim() ||
        !isStringArray(provider.tags) ||
        provider.tags.length === 0 ||
        typeof provider.enter !== 'function' ||
        (provider.transparent !== undefined && typeof provider.transparent !== 'boolean')
      ) {
        throw new Error(
          `[Pyreon] Plugin "${name}" colour-scope provider needs a nonempty module string, a nonempty tags array of strings and an enter function.`,
        )
      }
    }
  }
  if (stubs !== undefined) {
    const entry = stubs as { swift?: unknown; kotlin?: unknown } | null
    if (
      !entry ||
      typeof entry !== 'object' ||
      (entry.swift !== undefined && typeof entry.swift !== 'function') ||
      (entry.kotlin !== undefined && typeof entry.kotlin !== 'function')
    ) {
      throw new Error(`[Pyreon] Plugin "${name}" stubs must be an object with swift and/or kotlin functions.`)
    }
  }
  if (calls !== undefined) {
    if (!calls || typeof calls !== 'object' || Array.isArray(calls)) {
      throw new Error(`[Pyreon] Plugin "${name}" calls must be an object keyed by hook name.`)
    }
    for (const [hook, recognizer] of Object.entries(calls)) {
      if (typeof recognizer !== 'function') {
        throw new Error(`[Pyreon] Plugin "${name}" call "${hook}" must be a recognizer function.`)
      }
    }
  }
  if (decls !== undefined) {
    if (!decls || typeof decls !== 'object' || Array.isArray(decls)) {
      throw new Error(`[Pyreon] Plugin "${name}" decls must be an object keyed by declaration type.`)
    }
    for (const [type, emitter] of Object.entries(decls)) {
      const entry = emitter as { swift?: unknown; kotlin?: unknown; legacyKind?: unknown } | null
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.swift !== 'function' ||
        typeof entry.kotlin !== 'function' ||
        (entry.legacyKind !== undefined && typeof entry.legacyKind !== 'string')
      ) {
        throw new Error(
          `[Pyreon] Plugin "${name}" decl "${type}" needs swift and kotlin emitter functions.`,
        )
      }
    }
  }
  if (calls !== undefined && Object.keys(calls as object).length > 0 && decls === undefined) {
    throw new Error(
      `[Pyreon] Plugin "${name}" declares calls but no decls — a recognizer returns a declaration type that needs an emitter.`,
    )
  }
  if (memberCalls !== undefined) {
    if (!memberCalls || typeof memberCalls !== 'object' || Array.isArray(memberCalls)) {
      throw new Error(`[Pyreon] Plugin "${name}" memberCalls must be an object keyed by method name.`)
    }
    for (const [method, lowering] of Object.entries(memberCalls)) {
      const entry = lowering as { swift?: unknown; kotlin?: unknown } | null
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.swift !== 'function' ||
        typeof entry.kotlin !== 'function'
      ) {
        throw new Error(
          `[Pyreon] Plugin "${name}" memberCall "${method}" needs swift and kotlin functions.`,
        )
      }
    }
    if (Object.keys(memberCalls as object).length > 0 && decls === undefined) {
      throw new Error(
        `[Pyreon] Plugin "${name}" declares memberCalls but no decls — a member call is only claimed on a binding one of the plugin's own declarations created.`,
      )
    }
  }
  if (unlowered !== undefined) {
    if (!unlowered || typeof unlowered !== 'object' || Array.isArray(unlowered)) {
      throw new Error(`[Pyreon] Plugin "${name}" unlowered must be an object keyed by module.`)
    }
    for (const [module, spec] of Object.entries(unlowered)) {
      const entry = spec as { advice?: unknown; supported?: unknown } | null
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.advice !== 'string' ||
        !entry.advice.trim() ||
        (entry.supported !== undefined && !isStringArray(entry.supported))
      ) {
        throw new Error(
          `[Pyreon] Plugin "${name}" unlowered "${module}" needs a nonempty advice string and, optionally, a supported array of strings.`,
        )
      }
    }
  }
  if (refineParse !== undefined && typeof refineParse !== 'function') {
    throw new Error(`[Pyreon] Plugin "${name}" refineParse must be a synchronous function.`)
  }
  for (const [field, value] of [
    ['runtimeTypes', runtimeTypes],
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
