/**
 * The public plugin API: third-party emitters and IR transforms.
 *
 * A plugin is a plain object with a `name` and up to three hooks. It is given
 * the IR — the same spec-agnostic model every built-in emitter reads — and the
 * writer the built-ins use, so adding an output (an MSW handler set, an MCP
 * tool table, a Postman collection) is a file in the app's repo rather than a
 * fork of this package.
 *
 * Four properties are enforced here rather than hoped for, because each one is
 * a promise the rest of Lathe already makes and a plugin could otherwise break:
 *
 *  1. ATTRIBUTION. Every failure inside a hook names the plugin and the hook.
 *     A stack trace pointing into `generate()` says nothing about whose code
 *     threw.
 *  2. IMMUTABILITY. The document a hook receives is frozen. A transform that
 *     mutates in place would change what every LATER hook and emitter reads in
 *     an order-dependent way; it must return a modified copy instead.
 *  3. DETERMINISM. `lathe check` compares regenerated output byte-for-byte, so
 *     a plugin that stamps a date or iterates a `Set` built from `Math.random`
 *     turns CI red forever. Each hook runs TWICE on identical input and must
 *     agree with itself; a disagreement is an error naming the plugin.
 *  4. PARTICIPATION. Plugin files are ordinary generated files: they are listed
 *     in `lathe-manifest.json` (so a file a plugin stops emitting is pruned),
 *     compared by `lathe check`, formatted by `format`, and guarded against
 *     path collisions with the built-ins.
 *
 * Hooks are SYNCHRONOUS on purpose. Generation is a pure function of the spec
 * and the config; anything asynchronous (a network call, a file read) is input
 * the plugin should take as an OPTION at construction, where it is visible in
 * the config, rather than a hidden dependency of every run.
 */

import type { GeneratedFile } from '../emit/writer'
import { SourceFile } from '../emit/writer'
import type { IrDocument, IrNote, IrOperation, Reach } from './ir'
import type { PluginName, ResolvedConfig } from './config'
import { collectRefNames, operationTypes } from './walk'
import { modelIdent, operationIdent } from './naming'

/** What every hook can read. */
export interface LathePluginSetupContext {
  /** The resolved config of the project being generated. */
  readonly config: ResolvedConfig
}

/** What `transformDocument` can read, plus a way to report a loss. */
export interface LathePluginTransformContext extends LathePluginSetupContext {
  /**
   * Record a note attributed to this plugin (code `plugin`, severity `loss`),
   * shown in the report beside the input layer's own — the way to say "this
   * plugin could not honour X" instead of dropping it silently.
   */
  note(message: string, at?: string): void
}

/** What `emit` can read. */
export interface LathePluginEmitContext extends LathePluginSetupContext {
  /** The final document, after every transform. Frozen. */
  readonly doc: IrDocument
  /** Per-operation native reach, keyed by operation id. */
  readonly reach: ReadonlyMap<string, { reach: Reach; reason?: string | undefined }>
  /**
   * What the BUILT-IN emitters produced this run — to import from it, or to
   * avoid its paths. Earlier plugins' files are listed too.
   */
  readonly files: readonly GeneratedFile[]
  /** The header every generated file starts with; a `SourceFile` gets it automatically. */
  readonly banner: string
}

/**
 * One file a plugin emits. A `SourceFile` (the writer the built-ins use) is
 * built with the standard banner; a plain `{ path, contents }` is written
 * verbatim.
 */
export type LathePluginFile = SourceFile | (GeneratedFile & {
  /**
   * `true` when the module does something at import time (registers a service
   * worker, installs mocks). It is then listed in the emitted `package.json`'s
   * `sideEffects`, so a bundler does not tree-shake it away. Default `false`.
   */
  sideEffects?: boolean | undefined
})

/** A Lathe plugin. Create one with {@link definePlugin}. */
export interface LathePlugin {
  /**
   * Unique name — used in error messages and the report. Must not be a
   * built-in plugin's name. Conventionally the package name.
   */
  readonly name: string
  /**
   * Built-in plugins whose OUTPUT this plugin's files import. They are turned
   * on automatically, exactly like a built-in's own requirements.
   */
  readonly requires?: readonly PluginName[] | undefined
  /** Once per project, before anything is generated. Throw to refuse a config. */
  setup?(ctx: LathePluginSetupContext): void
  /**
   * Rewrite the document before any emitter reads it. Return a modified COPY
   * (the argument is frozen), or nothing to leave it unchanged.
   */
  transformDocument?(doc: IrDocument, ctx: LathePluginTransformContext): IrDocument | undefined | void
  /** Emit files. Runs after every built-in emitter. */
  emit?(ctx: LathePluginEmitContext): readonly LathePluginFile[] | undefined | void
}

/** The symbol {@link definePlugin} stamps, so a config entry is known to be a plugin. */
const PLUGIN_BRAND = Symbol.for('pyreon.lathe.plugin')

/**
 * Declare a Lathe plugin.
 *
 * Identity at the type level (it exists for inference and completion), plus a
 * runtime validation of the shape, so a typo such as `transform:` for
 * `transformDocument:` fails when the config LOADS rather than being a hook
 * that silently never runs.
 *
 * @example
 * ```ts
 * import { definePlugin, SourceFile } from '@pyreon/lathe'
 *
 * // One `export const <op>Path = '…'` per operation — a table a router or an
 * // analytics layer can import without pulling in the client.
 * export const pathTable = definePlugin({
 *   name: 'path-table',
 *   emit({ doc }) {
 *     const f = new SourceFile('paths.ts')
 *     for (const op of doc.operations) f.line(`export const ${op.id}Path = ${JSON.stringify(op.path)}`)
 *     return [f]
 *   },
 * })
 *
 * // pyreon.config.ts
 * export default defineConfig({ lathe: { input: './openapi.yaml', plugins: ['schemas', 'client', pathTable] } })
 * ```
 */
export function definePlugin<const P extends LathePlugin>(plugin: P): P {
  if (plugin === null || typeof plugin !== 'object') {
    throw new Error('[Pyreon] lathe: definePlugin() takes an object: `definePlugin({ name, emit() { … } })`.')
  }
  if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
    throw new Error('[Pyreon] lathe: a plugin needs a non-empty `name` — it attributes errors and report lines.')
  }
  const known = new Set(['name', 'requires', 'setup', 'transformDocument', 'emit'])
  for (const key of Object.keys(plugin)) {
    if (!known.has(key)) {
      throw new Error(
        `[Pyreon] lathe: plugin \`${plugin.name}\` has an unknown key \`${key}\`. Known: ${[...known].join(', ')}.`,
      )
    }
  }
  for (const hook of ['setup', 'transformDocument', 'emit'] as const) {
    if (plugin[hook] !== undefined && typeof plugin[hook] !== 'function') {
      throw new Error(`[Pyreon] lathe: plugin \`${plugin.name}\`: \`${hook}\` must be a function.`)
    }
  }
  Object.defineProperty(plugin, PLUGIN_BRAND, { value: true, enumerable: false })
  return plugin
}

/** `true` for an object {@link definePlugin} produced. */
export function isLathePlugin(value: unknown): value is LathePlugin {
  return value !== null && typeof value === 'object' && (value as Record<symbol, unknown>)[PLUGIN_BRAND] === true
}

/** Wrap a hook failure so the message names the plugin and the hook. */
function attribute(plugin: LathePlugin, hook: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  // A TypeError from writing to a frozen object is the one failure with a
  // known cause and a known fix, so it gets said plainly.
  const frozen = err instanceof TypeError && /read[- ]only|not extensible|frozen|Cannot (assign|add|delete)/i.test(message)
  const hint = frozen
    ? ' — the document is immutable; return a modified copy from `transformDocument` instead of mutating it.'
    : ''
  return new Error(`[Pyreon] lathe: plugin \`${plugin.name}\` failed in \`${hook}\`: ${message}${hint}`, { cause: err })
}

/** Freeze a value and everything reachable from it. Already-frozen subtrees are skipped. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  return value
}

/**
 * A canonical string for a document, for the determinism check. `JSON` is
 * enough: the IR is plain data by construction, and key ORDER is part of what
 * must be deterministic (it decides emitted field order).
 */
function fingerprint(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined'
}

/** Run every plugin's `setup`. */
export function runSetup(plugins: readonly LathePlugin[], config: ResolvedConfig): void {
  for (const plugin of plugins) {
    if (!plugin.setup) continue
    try {
      plugin.setup({ config })
    } catch (err) {
      throw attribute(plugin, 'setup', err)
    }
  }
}

/**
 * Run every plugin's `transformDocument`, in declaration order. The input is
 * frozen; the result is validated and frozen before the next plugin sees it.
 */
export function runTransforms(doc: IrDocument, plugins: readonly LathePlugin[], config: ResolvedConfig): IrDocument {
  let current = deepFreeze(doc)
  for (const plugin of plugins) {
    const hook = plugin.transformDocument
    if (!hook) continue
    const once = (): { doc: IrDocument; notes: IrNote[] } => {
      const notes: IrNote[] = []
      const ctx: LathePluginTransformContext = {
        config,
        note: (message, at = '#') => {
          notes.push({ code: 'plugin', message: `[${plugin.name}] ${message}`, at })
        },
      }
      let out: IrDocument | undefined | void
      try {
        out = hook.call(plugin, current, ctx)
      } catch (err) {
        throw attribute(plugin, 'transformDocument', err)
      }
      if (out !== undefined && (out === null || typeof out !== 'object')) {
        throw new Error(
          `[Pyreon] lathe: plugin \`${plugin.name}\`: \`transformDocument\` must return a document or nothing; got ${out === null ? 'null' : typeof out}.`,
        )
      }
      return { doc: out ?? current, notes }
    }
    const first = once()
    const second = once()
    if (fingerprint(first.doc) !== fingerprint(second.doc) || fingerprint(first.notes) !== fingerprint(second.notes)) {
      throw new Error(
        `[Pyreon] lathe: plugin \`${plugin.name}\`: \`transformDocument\` returned different documents for the same input. ` +
          'Generation must be deterministic — `lathe check` compares output byte-for-byte. Look for a timestamp, a random value, or an unordered iteration.',
      )
    }
    let next = first.doc
    if (first.notes.length > 0) next = { ...next, notes: [...next.notes, ...first.notes] }
    validateDocument(next, `plugin \`${plugin.name}\``)
    current = deepFreeze(next)
  }
  return current
}

/** Built-in and bookkeeping paths a plugin may not claim. */
const RESERVED_PATHS = new Set(['lathe-manifest.json', 'api-surface.json', 'package.json'])

/** A relative POSIX path that cannot leave the output directory. */
function isSafeRelative(p: string): boolean {
  if (p.length === 0 || p.startsWith('/') || p.includes('\\') || /^[A-Za-z]:/.test(p)) return false
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
}

/** A plugin's emitted files, built and checked. */
export interface PluginFiles {
  files: GeneratedFile[]
  /** Paths (`./x.ts`) that must be listed under `sideEffects`. */
  sideEffects: string[]
}

/**
 * Run every plugin's `emit`, after the built-ins. Each plugin's files are
 * sorted by path, so the order a plugin returns them in cannot move anything.
 */
export function runEmits(
  plugins: readonly LathePlugin[],
  base: Omit<LathePluginEmitContext, 'files'>,
  builtIn: readonly GeneratedFile[],
): PluginFiles {
  const all: GeneratedFile[] = []
  const sideEffects: string[] = []
  const owner = new Map<string, string>(builtIn.map((f) => [f.path.toLowerCase(), 'the built-in emitters']))
  for (const plugin of plugins) {
    const hook = plugin.emit
    if (!hook) continue
    const once = (): Array<{ file: GeneratedFile; sideEffects: boolean }> => {
      let out: readonly LathePluginFile[] | undefined | void
      try {
        out = hook.call(plugin, { ...base, files: [...builtIn, ...all] })
      } catch (err) {
        throw attribute(plugin, 'emit', err)
      }
      if (out === undefined) return []
      if (!Array.isArray(out)) {
        throw new Error(`[Pyreon] lathe: plugin \`${plugin.name}\`: \`emit\` must return an array of files or nothing.`)
      }
      return out.map((f, i) => {
        if (f instanceof SourceFile) return { file: f.build(base.banner), sideEffects: false }
        if (
          f === null ||
          typeof f !== 'object' ||
          typeof (f as GeneratedFile).path !== 'string' ||
          typeof (f as GeneratedFile).contents !== 'string'
        ) {
          throw new Error(
            `[Pyreon] lathe: plugin \`${plugin.name}\`: \`emit\` returned an invalid file at index ${i} — expected a SourceFile or \`{ path: string, contents: string }\`.`,
          )
        }
        return { file: { path: f.path, contents: f.contents }, sideEffects: f.sideEffects === true }
      })
    }
    const key = (list: ReturnType<typeof once>): string =>
      fingerprint(list.map((e) => [e.file.path, e.file.contents, e.sideEffects]).sort())
    const first = once()
    if (key(first) !== key(once())) {
      throw new Error(
        `[Pyreon] lathe: plugin \`${plugin.name}\`: \`emit\` produced different files for the same input. ` +
          'Generation must be deterministic — `lathe check` compares output byte-for-byte. Look for a timestamp, a random value, or an unordered iteration.',
      )
    }
    for (const { file, sideEffects: effectful } of [...first].sort((a, b) => (a.file.path < b.file.path ? -1 : a.file.path > b.file.path ? 1 : 0))) {
      if (!isSafeRelative(file.path)) {
        throw new Error(
          `[Pyreon] lathe: plugin \`${plugin.name}\` emitted \`${file.path}\`, which is not a relative path inside the output directory.`,
        )
      }
      if (RESERVED_PATHS.has(file.path)) {
        throw new Error(`[Pyreon] lathe: plugin \`${plugin.name}\` emitted \`${file.path}\`, which Lathe itself writes.`)
      }
      const prev = owner.get(file.path.toLowerCase())
      if (prev !== undefined) {
        throw new Error(
          `[Pyreon] lathe: plugin \`${plugin.name}\` emitted \`${file.path}\`, which ${prev} already emit${prev.startsWith('plugin') ? 's' : ''} — one would overwrite the other (paths compare case-insensitively). Emit under a directory of the plugin's own.`,
        )
      }
      owner.set(file.path.toLowerCase(), `plugin \`${plugin.name}\``)
      all.push(file)
      if (effectful) sideEffects.push(`./${file.path}`)
    }
  }
  return { files: all, sideEffects }
}

/**
 * Structural checks on a document a plugin returned: the invariants every
 * emitter assumes. A plugin that renames a model without rewriting its
 * references produces output that does not compile; it is refused here, with
 * the plugin's name, instead.
 */
export function validateDocument(doc: IrDocument, who: string): void {
  const fail = (what: string): never => {
    throw new Error(`[Pyreon] lathe: ${who} returned an invalid document: ${what}`)
  }
  if (!Array.isArray(doc.operations) || !Array.isArray(doc.models) || !Array.isArray(doc.notes)) {
    fail('`operations`, `models` and `notes` must be arrays.')
  }
  const models = new Set<string>()
  const lower = new Map<string, string>()
  for (const m of doc.models) {
    if (m.name !== modelIdent(m.name)) fail(`model \`${m.name}\` is not a valid model name (try \`${modelIdent(m.name)}\`).`)
    if (models.has(m.name)) fail(`two models are named \`${m.name}\`.`)
    const clash = lower.get(m.name.toLowerCase())
    if (clash !== undefined) fail(`models \`${clash}\` and \`${m.name}\` differ only in case, so their files collide on macOS and Windows.`)
    models.add(m.name)
    lower.set(m.name.toLowerCase(), m.name)
  }
  const ids = new Set<string>()
  for (const op of doc.operations) {
    if (op.id !== operationIdent(op.id)) fail(`operation \`${op.id}\` is not a valid operation name (try \`${operationIdent(op.id)}\`).`)
    if (ids.has(op.id)) fail(`two operations are named \`${op.id}\`.`)
    ids.add(op.id)
  }
  const refs = new Set<string>()
  for (const m of doc.models) collectRefNames(m.type, refs)
  for (const op of doc.operations) for (const t of operationTypes(op)) collectRefNames(t, refs)
  const dangling = [...refs].filter((r) => !models.has(r)).sort()
  if (dangling.length > 0) {
    fail(`it references model(s) that do not exist: ${dangling.join(', ')}. A model rename must rewrite every \`{ kind: 'ref' }\` to it.`)
  }
}
