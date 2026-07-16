/**
 * Type-level inference helpers for typed translation keys — "derive, don't
 * annotate twice". ZERO runtime bytes (types only).
 *
 * Opt-in typed instance pattern:
 *
 * @example
 * ```ts
 * const en = {
 *   greeting: 'Hello {{name}}',
 *   nav: { home: 'Home', about: 'About' },
 *   items_one: '{{count}} item',
 *   items_other: '{{count}} items',
 * } as const
 *
 * const i18n = createI18n<typeof en>({ locale: 'en', messages: { en } })
 * i18n.t('nav.home')      // ✓ autocompleted
 * i18n.t('items', { count: 2 }) // ✓ plural suffixes collapse to the base key
 * i18n.t('nav.hoem')      // ✗ compile error
 * ```
 */

import type { InterpolationValue, InterpolationValues } from './types'

// ─── Depth budget ─────────────────────────────────────────────────────────────
// MessageKeys recursion is capped at 6 nesting levels (realistic message
// trees are 2–4). `Prev[D]` decrements; `never` terminates. Without the cap a
// pathological/self-referential messages type could blow TS's instantiation
// limit and degrade editor responsiveness for the whole project.
type Prev = [never, 0, 1, 2, 3, 4]

/** CLDR plural-category suffixes recognized by `t(key, { count })`. */
type PluralSuffixWord = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

/**
 * Collapse a plural-suffixed leaf key to its BASE key: `items_one` /
 * `items_other` → `items` — matching how you actually CALL `t('items',
 * { count })`. Applies to the 6 CLDR categories; a legit key that happens to
 * end in `_one` etc. also collapses (rename it if that's unwanted).
 */
type CollapsePluralSuffix<K extends string> = K extends `${infer Base}_${PluralSuffixWord}`
  ? Base
  : K

type MessageKeysAtDepth<M, D extends number> = [D] extends [never]
  ? never
  : string extends keyof M
    ? string
    : {
        [K in keyof M & string]: M[K] extends string
          ? CollapsePluralSuffix<K>
          : M[K] extends Record<string, unknown>
            ? `${K}.${MessageKeysAtDepth<M[K], Prev[D]> & string}`
            : CollapsePluralSuffix<K>
      }[keyof M & string]

/**
 * The dot-path key union of a messages object — every translatable key,
 * nested keys joined with `.`, plural suffixes (`_one`/`_other`/`_zero`/
 * `_two`/`_few`/`_many`) collapsed to their base key.
 *
 * Recursion is depth-capped at 6 nesting levels (see `Prev` above) —
 * deeper subtrees contribute no keys. Over a messages object typed as
 * `TranslationDictionary` (an index signature — e.g. a non-literal import),
 * this degrades gracefully to `string`.
 *
 * Pass the messages object's type, usually via `typeof`:
 *
 * @example
 * ```ts
 * const en = { nav: { home: 'Home' }, items_one: '…', items_other: '…' } as const
 * type Keys = MessageKeys<typeof en> // 'nav.home' | 'items'
 * ```
 */
export type MessageKeys<M> = MessageKeysAtDepth<M, 5>

// ─── Param extraction ─────────────────────────────────────────────────────────

/** Strip leading/trailing spaces from a literal (interpolation allows `{{ name }}`). */
type Trim<S extends string> = S extends ` ${infer R}`
  ? Trim<R>
  : S extends `${infer R} `
    ? Trim<R>
    : S

/**
 * Extract the param name from one `{{ … }}` placeholder body: the text before
 * an optional `, format` spec, trimmed. Names containing spaces are NOT
 * placeholders at runtime (`{{not a key}}` stays literal) — excluded here too.
 */
type ParamName<Inner extends string> = Trim<
  Inner extends `${infer Name},${string}` ? Name : Inner
> extends infer N extends string
  ? N extends `${string} ${string}`
    ? never
    : N
  : never

/** Union of `{{param}}` names appearing in a literal message string. */
type ParamNames<S extends string> = S extends `${string}{{${infer Inner}}}${infer Rest}`
  ? ParamName<Inner> | ParamNames<Rest>
  : never

/** Param record for one resolved message value. */
type ParamsOf<V> = V extends string
  ? string extends V
    ? InterpolationValues
    : { [P in ParamNames<V>]: InterpolationValue }
  : InterpolationValues

/**
 * Param record for a message resolved through a plural suffix — the message's
 * own `{{param}}` names plus the `count: number` that drives plural selection
 * (built in ONE mapped type so `count` is exactly `number`, not an
 * intersection).
 */
type PluralParamsOf<V> = V extends string
  ? string extends V
    ? InterpolationValues
    : { [P in ParamNames<V> | 'count']: P extends 'count' ? number : InterpolationValue }
  : InterpolationValues

/**
 * Derive the interpolation params of ONE message: the `{{param}}` names in
 * the message literal (inline format specs like `{{amount, currency}}`
 * contribute their name), plus `count: number` when the key resolves through
 * plural suffixes.
 *
 * Requires LITERAL message values (`as const`) — over widened `string`
 * values it degrades to the loose `InterpolationValues` record. A message
 * with no placeholders yields `{}` (no required params).
 *
 * @example
 * ```ts
 * const en = { greeting: 'Hi {{name}}, {{n, number}}', items_other: '{{count}} items' } as const
 * type P1 = TranslationParams<typeof en, 'greeting'> // { name: InterpolationValue; n: InterpolationValue }
 * type P2 = TranslationParams<typeof en, 'items'>    // { count: number }
 * ```
 */
export type TranslationParams<M, K extends string> = K extends `${infer Head}.${infer Rest}`
  ? Head extends keyof M
    ? M[Head] extends Record<string, unknown>
      ? TranslationParams<M[Head], Rest>
      : InterpolationValues
    : InterpolationValues
  : K extends keyof M
    ? ParamsOf<M[K]>
    : `${K}_other` extends keyof M
      ? PluralParamsOf<M[`${K}_other` & keyof M]>
      : `${K}_one` extends keyof M
        ? PluralParamsOf<M[`${K}_one` & keyof M]>
        : InterpolationValues

/**
 * The key type a TYPED i18n instance accepts: the derived {@link MessageKeys}
 * union PLUS any `namespace:key` string (namespaced lookups stay unchecked —
 * namespaces load at runtime, so the type can't enumerate them). When the
 * messages type carries no literal keys, degrades to plain `string`.
 */
export type TypedTranslationKey<M> = string extends MessageKeys<M>
  ? string
  : MessageKeys<M> | `${string}:${string}`
