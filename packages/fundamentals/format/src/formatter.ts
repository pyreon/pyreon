/**
 * Formatters as values. A `Formatter<In>` is a plain `(value) => string` with
 * `with`, `from`, `fallback`, `parts`, `range` and `options` attached. One
 * implementation: each kind supplies a `KindDef` that builds a `Core` (the
 * call, and parts / range where `Intl` has them) over the SAME cache tables
 * the free functions use; this file adds the derivation methods.
 *
 * Hot path of a built formatter: read the active locale (and zone for dates),
 * compare it with the last one resolved, then `intl.format(value)`. No hashing
 * and no allocation per call. Creating a formatter only freezes a copy of its
 * spec; the `Intl` object is looked up (and cached, bounded) on first use, so
 * `with` / `from` / `fallback` in a loop add nothing to any table.
 */
import type { Formatter, FormatterKind, KindInfo } from './types'

/** Where the active locale and zone come from: constants in `/core`, signals in the reactive entry. */
export interface Env {
  /** The active locale (`''` = the runtime default). A reactive read in the reactive entry. */
  readonly locale: () => string
  /** The active zone (`''` = the runtime zone). */
  readonly zone: () => string
}

/** What a kind builds: the call, plus `parts` / `range` where the platform has them. */
export interface Core<In> {
  call(value: In): string
  parts?(value: In): readonly unknown[]
  range?(start: In, end: In): string
}

/** A formatter kind: builds a `Core` from a frozen spec. */
export interface KindDef<K extends FormatterKind> {
  create(spec: Readonly<KindInfo[K]['spec']>, locale: () => string, zone: () => string): Core<KindInfo[K]['in']>
}

const constant = (value: string): (() => string) => () => value

/** The spec's own `locale`, when it has one, replaces the active locale and so does not subscribe to it. */
function localeFor(spec: { locale?: string | undefined }, env: Env): () => string {
  return typeof spec.locale === 'string' && spec.locale !== '' ? constant(spec.locale) : env.locale
}

/** Merge overrides over a spec; an `undefined` override unsets the option. */
function merge<S extends object>(spec: S, overrides: object): S {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(spec)) out[key] = value
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete out[key]
    else out[key] = value
  }

  // The result has the keys of `spec` with some replaced; `overrides` is typed `Partial<S>` at the public surface.
  return Object.freeze(out) as S
}

/**
 * Build a formatter of kind `K` from its spec. `adapt` (set by `from`) maps the
 * caller's value to the kind's input before formatting.
 */
export function makeFormatter<K extends FormatterKind>(
  def: KindDef<K>,
  spec: KindInfo[K]['spec'],
  env: Env,
  adapt?: (source: never) => KindInfo[K]['in'],
): Formatter<KindInfo[K]['in'], K> {
  type In = KindInfo[K]['in']
  const frozen: Readonly<KindInfo[K]['spec']> = Object.isFrozen(spec) ? spec : Object.freeze({ ...spec })
  const core = def.create(frozen, localeFor(frozen, env), env.zone)
  const call = adapt === undefined ? core.call : (source: never): string => core.call(adapt(source))
  const members: Record<string, unknown> = {
    options: frozen,
    with: (overrides: object) => makeFormatter(def, merge(frozen, overrides), env, adapt),
    from: (map: (source: never) => unknown) =>
      makeFormatter(def, frozen, env, adapt === undefined ? (map as (source: never) => In) : (source: never) => adapt(map(source) as never)),
    fallback: (text: string) => makeFormatter(def, merge(frozen, { fallback: text }), env, adapt),
  }
  const { parts, range } = core
  if (parts !== undefined) {
    members.parts = adapt === undefined ? parts : (source: never) => parts(adapt(source))
  }
  if (range !== undefined) {
    members.range = adapt === undefined ? range : (a: never, b: never) => range(adapt(a), adapt(b))
  }

  // `call` is a fresh function per formatter, so attaching the members mutates nothing shared. The object
  // assembled here satisfies `Formatter<In, K>` (the conditional `parts` / `range` members follow `core`).
  return Object.assign(call, members) as unknown as Formatter<In, K>
}
