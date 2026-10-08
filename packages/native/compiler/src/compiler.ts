import { createRegistries, withRegistries } from './active-registries'
import { kotlinBackend, swiftBackend } from './backends'
import { BUILT_IN_PLUGINS } from './built-in-plugins'
import { moduleTag, withSynthStructSuffix } from './expr-utils'
import { parsePyreon } from './parse'
import {
  SUPPORTED_PLUGIN_API_VERSIONS,
  type CompilerBackend,
  type CompilerConfig,
  type CompilerContext,
  type CompilerModule,
  type CompilerOptions,
  type CompilerPass,
  type CompilerPlugin,
  type NativeCompiler,
} from './plugin'
import { assertPluginExtensions, assertPluginShape } from './plugin-shape'
import { orderPlugins, selectDiscovered } from './service-registry'
import type { TargetLanguage, TransformResult } from './types'

export { BUILT_IN_PLUGINS }

// Built-in plugins' passes run on the live IR (they are the compiler's own,
// trusted code); every other plugin gets an isolated clone.
const BUILT_IN_SET: ReadonlySet<CompilerPlugin> = new Set(BUILT_IN_PLUGINS)

const MODULE_ARRAYS = [
  'imports',
  'components',
  'enums',
  'structs',
  'moduleDecls',
  'moduleItems',
  'helperFns',
  'styledComponents',
  'rocketstyleComponents',
  'attrsComponents',
  'warnings',
] as const

function assertModule(value: unknown): asserts value is CompilerModule {
  if (
    !value ||
    typeof value !== 'object' ||
    MODULE_ARRAYS.some((key) => !Array.isArray((value as CompilerModule)[key])) ||
    !((value as CompilerModule).aliasImports instanceof Map) ||
    (value as CompilerModule).imports.some((entry) => typeof entry !== 'string') ||
    (value as CompilerModule).warnings.some((entry) => typeof entry !== 'string')
  ) {
    throw new Error(
      '[Pyreon] Return a complete CompilerModule, or mutate the provided module and return nothing.',
    )
  }
}

function assertSync(value: unknown): void {
  if (
    value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  ) {
    // Refusing an asynchronous hook must also consume its eventual rejection.
    void Promise.resolve(value).catch(() => {})
    throw new Error(
      '[Pyreon] Native compiler hooks are synchronous. Load asynchronous resources before creating the compiler.',
    )
  }
}

function invoke<T>(owner: string, phase: string, callback: () => T): T {
  try {
    const result = callback()
    assertSync(result)
    return result
  } catch (cause) {
    throw new Error(
      `[Pyreon] Native compiler ${owner} failed in ${phase}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    )
  }
}

/**
 * Registrations are snapshotted once and never grow during compilation.
 * Every invocation owns its IR and warning buffers; no global plugin registry.
 * Custom callbacks receive isolated IR, including runtime-owned chart metadata.
 * @example
 * const compiler = createCompiler({ plugins: [{
 *   name: 'diagnostics', apiVersion: 1,
 *   transformIR(module, context) {
 *     if (!module.components.length) context.warn('No components found')
 *   },
 * }] })
 * compiler.transform(source, { target: 'swift', filename: 'App.tsx' })
 */
export function createCompiler<Target extends string = never>(
  config: CompilerConfig<Target> = {},
): NativeCompiler<TargetLanguage | Target> {
  const explicit = config.plugins ?? []
  if (!Array.isArray(explicit))
    throw new Error('[Pyreon] Native compiler plugins must be an array.')
  const discovered = config.discovered ?? []
  if (!Array.isArray(discovered))
    throw new Error('[Pyreon] Native compiler discovered plugins must be an array.')
  for (const plugin of discovered) assertPluginShape(plugin)
  const selection = selectDiscovered(BUILT_IN_PLUGINS, explicit, discovered)
  const supplied = [...explicit, ...selection.kept]
  const plugins: CompilerPlugin[] = BUILT_IN_PLUGINS.filter(
    (plugin) => !selection.replaced.includes(plugin.name),
  )
  const names = new Set<string>(plugins.map((plugin) => plugin.name))
  const backends = new Map<
    string,
    { owner: string; emit: CompilerBackend['emit']; custom: boolean }
  >()
  for (const backend of [swiftBackend, kotlinBackend]) {
    backends.set(backend.target, {
      owner: `backend "${backend.target}"`,
      emit: backend.emit,
      custom: false,
    })
  }
  for (const plugin of supplied) {
    if (
      !plugin ||
      typeof plugin !== 'object' ||
      typeof plugin.name !== 'string' ||
      !plugin.name.trim()
    ) {
      throw new Error('[Pyreon] Every native compiler plugin needs a nonempty name.')
    }
    const name = plugin.name
    if (names.has(name))
      throw new Error(
        `[Pyreon] Duplicate native compiler plugin "${name}". Use unique plugin names.`,
      )
    if (!SUPPORTED_PLUGIN_API_VERSIONS.includes(plugin.apiVersion)) {
      throw new Error(
        `[Pyreon] Native compiler plugin "${name}" requires API ${plugin.apiVersion}; this compiler supports API ${SUPPORTED_PLUGIN_API_VERSIONS.join(', ')}. Update the plugin and compiler together.`,
      )
    }
    assertPluginExtensions(name, plugin)
    for (const phase of ['transformIR', 'prepareIR'] as const) {
      if (plugin[phase] !== undefined && typeof plugin[phase] !== 'function') {
        throw new Error(`[Pyreon] Plugin "${name}" ${phase} must be a synchronous function.`)
      }
    }
    if (plugin.backends !== undefined && !Array.isArray(plugin.backends)) {
      throw new Error(`[Pyreon] Plugin "${name}" backends must be an array.`)
    }
    for (const backend of plugin.backends ?? []) {
      if (
        !backend ||
        typeof backend.target !== 'string' ||
        !backend.target.trim() ||
        typeof backend.emit !== 'function'
      ) {
        throw new Error(
          `[Pyreon] Plugin "${name}" backends need a nonempty target and an emit function.`,
        )
      }
      if (backends.has(backend.target)) {
        throw new Error(
          `[Pyreon] Duplicate native compiler target "${backend.target}" in plugin "${name}". Choose a distinct target name.`,
        )
      }
      backends.set(backend.target, {
        owner: `plugin "${name}" backend "${backend.target}"`,
        emit: backend.emit,
        custom: true,
      })
    }
    names.add(name)
    plugins.push({
      name,
      apiVersion: plugin.apiVersion,
      transformIR: plugin.transformIR,
      prepareIR: plugin.prepareIR,
      services: plugin.services,
      elements: plugin.elements,
      scopes: plugin.scopes,
      stubs: plugin.stubs,
      calls: plugin.calls,
      declCalls: plugin.declCalls,
      tier2Calls: plugin.tier2Calls,
      decls: plugin.decls,
      memberCalls: plugin.memberCalls,
      receivers: plugin.receivers,
      functions: plugin.functions,
      memberReads: plugin.memberReads,
      identifiers: plugin.identifiers,
      intrinsics: plugin.intrinsics,
      refModifiers: plugin.refModifiers,
      prepareEmit: plugin.prepareEmit,
      intrinsicAdvice: plugin.intrinsicAdvice,
      propsTypes: plugin.propsTypes,
      unlowered: plugin.unlowered,
      runtimeTypes: plugin.runtimeTypes,
      refineParse: plugin.refineParse,
      scanModule: plugin.scanModule,
      rewriteElement: plugin.rewriteElement,
      requestSources: plugin.requestSources,
      destructureCalls: plugin.destructureCalls,
      componentOnlyCalls: plugin.componentOnlyCalls,
      persistence: plugin.persistence,
      topLevel: plugin.topLevel,
      items: plugin.items,
      methodCalls: plugin.methodCalls,
      callExprs: plugin.callExprs,
      exprs: plugin.exprs,
      refineStructs: plugin.refineStructs,
      finishModule: plugin.finishModule,
      modules: plugin.modules,
      requires: plugin.requires,
      builtIn: plugin.builtIn,
    })
  }
  // Load-time errors, before any source is compiled: a missing `requires`, a
  // cycle, or two owners for one hook or one `(module, tag)` pair.
  const ordered = orderPlugins(plugins)
  const registries = createRegistries(ordered)
  const { services } = registries
  const targets = Object.freeze([...backends.keys()]) as readonly (TargetLanguage | Target)[]

  return Object.freeze({
    targets,
    services,
    registries,
    transform(source: string, options: CompilerOptions<TargetLanguage | Target>): TransformResult {
      // The parser and emitters read this instance's registries from the scoped
      // slot; it is restored when the call ends, however it ends.
      return withRegistries(registries, () => run(source, options))
    },
  })

  function run(source: string, options: CompilerOptions<TargetLanguage | Target>): TransformResult {
    // Capture declared values once, including class/prototype getters.
    const { target, filename, fonts } = options
    const resolvedOptions = Object.freeze({
      target,
      ...(filename !== undefined ? { filename } : {}),
      ...(fonts ? { fonts: Object.freeze({ ...fonts }) } : {}),
    })
    const backend = backends.get(resolvedOptions.target)
    if (!backend) {
      throw new Error(
        `[Pyreon] Unknown native compiler target "${resolvedOptions.target}". Available targets: ${targets.join(', ')}. Register a backend plugin or choose an available target.`,
      )
    }
    let module = parsePyreon(source, resolvedOptions.filename)
    const warnings: string[] = []
    const context = (owner: string): CompilerContext =>
      Object.freeze({
        source,
        options: resolvedOptions,
        services,
        warn(message: string) {
          if (typeof message !== 'string') throw new Error('[Pyreon] Warnings must be strings.')
          warnings.push(`[Pyreon] ${owner}: ${message}`)
        },
      })
    const runPasses = (phase: 'transformIR' | 'prepareIR') => {
      for (const plugin of ordered) {
        const pass: CompilerPass | undefined = plugin[phase]
        if (!pass) continue
        if (BUILT_IN_SET.has(plugin)) {
          pass(module, context(`plugin "${plugin.name}"`))
        } else {
          module = invoke(`plugin "${plugin.name}"`, phase, () => {
            const owned = structuredClone(module)
            const result = pass(owned, context(`plugin "${plugin.name}"`))
            assertSync(result)
            const next = result === undefined ? owned : result
            assertModule(next)
            // A plugin may return cached/shared data. The emitter must not
            // mutate it, nor retain it as the next compilation's input.
            return structuredClone(next)
          })
        }
      }
    }
    runPasses('transformIR')
    // Runtime-provided external declarations don't alter module identity.
    const suffix = resolvedOptions.filename === undefined ? '' : `_${moduleTag(module)}`
    runPasses('prepareIR')
    const emitted = withSynthStructSuffix(suffix, () =>
      invoke(backend.owner, 'emit', () => {
        const result = backend.emit(
          backend.custom ? structuredClone(module) : module,
          context(backend.owner),
        )
        assertSync(result)
        if (
          !result ||
          typeof result.code !== 'string' ||
          !Array.isArray(result.warnings) ||
          result.warnings.some((warning) => typeof warning !== 'string')
        ) {
          throw new Error(
            '[Pyreon] Return { code: string, warnings: string[] } from the backend.',
          )
        }
        return result
      }),
    )
    return {
      code: emitted.code,
      warnings: [...module.warnings, ...warnings, ...emitted.warnings],
    }
  }
}

