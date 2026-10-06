/**
 * The per-component slot a plugin's emit code reads through the `EmitContext`
 * facade: the component's ext declarations, a keyed state bag, and deferred
 * substitutions.
 *
 * Each emitter owns ONE current scope. It installs a fresh scope when a
 * component starts emitting, and restores the previous one when the component
 * ends (and a fresh module scope when a file starts), so nothing a plugin stores
 * can leak into the next component or the next compile. The scope belongs to
 * the emitter, never to a plugin: core reads a plugin's DECLARATIONS
 * ({@link PluginScope.declByName}) and may resolve a deferred token, but it
 * cannot read a plugin's {@link PluginScope.state} — that bag is opaque to it.
 */

import type { DeclIR, ExtDecl } from './types'

export interface PluginScope {
  /** The ext declaration bound to `name` in the component being emitted. */
  declByName(name: string): ExtDecl | undefined
  /** The ext declarations of `(plugin, type)` in the component being emitted, frozen. */
  decls(plugin: string, type: string): readonly ExtDecl[]
  /** A value that lives for the component being emitted: `init` runs on first use of `key`. */
  state<T>(key: string, init: () => T): T
  /** An opaque token to embed in emitted text; replaced by the value resolved for `key` once the component body has emitted. */
  deferred(key: string, fallback?: string): string
  /** Supply the text for every token created for `key`. */
  resolveDeferred(key: string, value: string): void
  /** Replace every deferred token in `text`; throws naming a key that was never resolved and has no fallback. */
  finalize(text: string): string
}

const TOKEN_OPEN = '__PYREON_DEFERRED('
const TOKEN_CLOSE = ')__'

/**
 * Replace every `__PYREON_DEFERRED(<key>)__` with `replace(key)`. A key is
 * one or more characters other than `)` and a newline.
 *
 * A scan rather than `/__PYREON_DEFERRED\(([^)\n]+)\)__/g`: the regex's key
 * class rescans to the end of the line from every unmatched opener, which is
 * quadratic on a long line of them (CodeQL js/polynomial-redos). The position of
 * the next `)` or newline is remembered and only recomputed once the scan has
 * moved past it, so each character is read a bounded number of times.
 */
export function replaceDeferredTokens(text: string, replace: (key: string) => string): string {
  let out = ''
  let copied = 0
  let at = text.indexOf(TOKEN_OPEN)
  let stop = -1
  while (at !== -1) {
    const keyStart = at + TOKEN_OPEN.length
    if (stop < keyStart) {
      stop = keyStart
      while (stop < text.length && text[stop] !== ')' && text[stop] !== '\n') stop++
    }
    if (stop > keyStart && text.startsWith(TOKEN_CLOSE, stop)) {
      out += text.slice(copied, at) + replace(text.slice(keyStart, stop))
      copied = stop + TOKEN_CLOSE.length
      at = text.indexOf(TOKEN_OPEN, copied)
    } else {
      at = text.indexOf(TOKEN_OPEN, keyStart)
    }
  }
  return copied === 0 ? text : out + text.slice(copied)
}

interface Deferred {
  value?: string
  fallback?: string
}

/**
 * A scope for one component (`decls` given) or for module-level emit (omitted —
 * there is no component text to substitute into, so `deferred` refuses).
 */
export function createPluginScope(decls?: readonly DeclIR[]): PluginScope {
  const byName = new Map<string, ExtDecl>()
  const ext: ExtDecl[] = []
  for (const d of decls ?? []) {
    if (d.kind !== 'ext') continue
    byName.set(d.name, d)
    ext.push(d)
  }
  const bag = new Map<string, unknown>()
  const pending = new Map<string, Deferred>()
  const inComponent = decls !== undefined
  return {
    declByName: (name) => byName.get(name),
    decls: (plugin, type) =>
      Object.freeze(ext.filter((d) => d.plugin === plugin && d.type === type)),
    state<T>(key: string, init: () => T): T {
      if (!bag.has(key)) bag.set(key, init())
      return bag.get(key) as T
    },
    deferred(key, fallback) {
      if (!inComponent) {
        throw new Error(
          `[Pyreon] ctx.deferred("${key}") was called outside a component — the substitution runs when a component body has been emitted, so a token created elsewhere would ship as a placeholder.`,
        )
      }
      if (key === '' || /[)\n]/.test(key)) {
        throw new Error(
          `[Pyreon] ctx.deferred key ${JSON.stringify(key)} must be nonempty and contain no ")" or newline.`,
        )
      }
      const entry = pending.get(key) ?? {}
      if (fallback !== undefined) entry.fallback = fallback
      pending.set(key, entry)
      return `__PYREON_DEFERRED(${key})__`
    },
    resolveDeferred(key, value) {
      const entry = pending.get(key) ?? {}
      entry.value = value
      pending.set(key, entry)
    },
    finalize(text) {
      if (pending.size === 0) return text
      return replaceDeferredTokens(text, (key) => {
        const entry = pending.get(key)
        const value = entry?.value ?? entry?.fallback
        if (value === undefined) {
          throw new Error(
            `[Pyreon] deferred value "${key}" was never resolved — a plugin embedded a ctx.deferred("${key}") token and nothing called ctx.resolveDeferred("${key}", …) (and no fallback was given), so the emitted code would contain a placeholder.`,
          )
        }
        return value
      })
    },
  }
}
