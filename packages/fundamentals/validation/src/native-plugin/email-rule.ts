/**
 * `@pyreon/validate`'s email grammar, spelled for NSRegularExpression (ICU)
 * and java.util.regex so a device reaches the SAME verdict the web does — at
 * every `precision`, including internationalised domains (`jan@müller.de`).
 *
 * The web grammar is `EMAIL_RE` / `EMAIL_HTML5_RE` (+ the rfc5322 length
 * limits) in `@pyreon/validate`'s `primitives/string.ts`. The transliteration
 * differs from the JS source in three deliberate places:
 *
 * - `$` becomes `\z`: ICU and Java `$` also match BEFORE a final line
 *   terminator, so `"a@b.co\n"` would pass on device.
 * - Every punctuation char inside a character class is escaped: Java reads
 *   `&&` as class intersection and ICU has set operators too; an escaped
 *   punctuation char is a literal in all three engines.
 * - No case-insensitive flag (the classes spell both cases): ICU folds `ſ`
 *   (U+017F) to `s` where JS does not.
 *
 * `\p{L}` / `\p{M}` / `\p{Nd}` mean the same Unicode general categories in
 * JS (`u` flag), ICU and Java, and all three match a supplementary code point
 * as one unit (so do `\uXXXX` escapes). The rfc5322 tier's limits are: local
 * part ≤ 64 (ASCII-only, so a lookahead counts it exactly), every domain label
 * ≤ 63 code points (a negative lookahead; the web counts code points too), and
 * total ≤ 254 UTF-16 units, which the
 * emitter checks as `utf16.count` / `length` — the web's `value.length`. The
 * web's domain ≤ 255 limit is implied by total ≤ 254, so it needs no check.
 *
 * Parity is asserted by EXECUTING these patterns on both toolchains against
 * `@pyreon/validate` itself (`native-email-rule-parity.test.ts`).
 */

import {
  dynamicKeyText,
  hasDynamicKey,
  staticPropKey,
  unwrapTypeLayers,
  type ModuleParseContext,
} from '@pyreon/native-compiler/plugin-api'
import type { EmailRule } from './ir'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/** A domain label's first char (no hyphen, no combining mark, no joiner). */
const LABEL_START = String.raw`\p{L}\p{Nd}`
/** Any domain label char — marks and the joiners ZWNJ / ZWJ after the first. */
const LABEL_CHAR = String.raw`\p{L}\p{M}\p{Nd}‌‍\-`
/** The IDNA label separators: `.`, U+3002, U+FF0E, U+FF61. */
const SEP = String.raw`\.。．｡`
/** A TLD: 2+ letters (marks after the first), or a punycode A-label. */
const TLD = String.raw`(?:\p{L}[\p{L}\p{M}]+|[Xx][Nn]\-\-[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)`

const LOCAL_STD = String.raw`(?!\.)(?!.*\.\.)[A-Za-z0-9\_\'\+\.\-]*[A-Za-z0-9\_\+\-]`
const DOMAIN_STD = `(?:[${LABEL_START}][${LABEL_CHAR}]*[${SEP}])+${TLD}`

/** `.email()` / `.email({ precision: 'standard' })` — `EMAIL_RE`. */
export const EMAIL_STANDARD_PATTERN = `^${LOCAL_STD}@${DOMAIN_STD}\\z`

/**
 * `.email({ precision: 'rfc5322' })` — `EMAIL_RE` + local ≤ 64 + every domain
 * label ≤ 63 code points (the web's check; total ≤ 254 is checked by the emitter).
 */
export const EMAIL_RFC5322_PATTERN =
  `^(?=[^@]{1,64}@)(?![^@]*@(?:[^${SEP}]*[${SEP}])*[^${SEP}]{64})${LOCAL_STD}@${DOMAIN_STD}\\z`

const HTML5_LABEL = String.raw`[${LABEL_START}](?:[${LABEL_CHAR}]{0,61}[\p{L}\p{M}\p{Nd}])?`

/** `.email({ precision: 'html5' })` — `EMAIL_HTML5_RE`. */
export const EMAIL_HTML5_PATTERN =
  String.raw`^[a-zA-Z0-9\.\!\#\$\%\&\'\*\+\/\=\?\^\_\`\{\|\}\~\-]+@` + `${HTML5_LABEL}(?:[${SEP}]${HTML5_LABEL})*\\z`

/** The rfc5322 tier's total-length limit (UTF-16 units, as the web's `value.length`). */
export const EMAIL_RFC5322_MAX_LENGTH = 254

/** The native pattern for a `@pyreon/validate` precision. */
export function emailPattern(precision: 'html5' | 'standard' | 'rfc5322'): string {
  return precision === 'html5'
    ? EMAIL_HTML5_PATTERN
    : precision === 'rfc5322'
      ? EMAIL_RFC5322_PATTERN
      : EMAIL_STANDARD_PATTERN
}

const EMAIL_PRECISIONS: ReadonlySet<string> = new Set(['html5', 'standard', 'rfc5322'])

/**
 * The email rule a `.email(...)` call lowers to -- or null, with a warning, when
 * it cannot lower faithfully (see `EmailRule`).
 *
 * zod's `.email(...)` keeps its rule whatever the options (they carry only a
 * message). `@pyreon/validate`'s `precision` CHANGES what the web accepts, so it
 * must be read: an inline string literal lowers; anything else DECLINES by name
 * rather than guessing a tier, which would make the device accept or reject
 * what the web does not.
 */
export function emailRule(
  arg: AnyNode | undefined,
  pyreonValidate: boolean,
  label: string,
  ctx: ModuleParseContext,
): EmailRule | null {
  if (!pyreonValidate) return { kind: 'zod' }
  if (!arg) return { kind: 'pyreon', precision: 'standard' }
  const opts = unwrapTypeLayers(arg) as AnyNode | undefined
  if (opts?.type !== 'ObjectExpression') {
    ctx.report(
      `${label}: the options argument is not an inline object, so whether it sets \`precision\` cannot be read — the field is NOT email-validated on device. Write the options inline: \`.email({ precision: 'html5' })\`.`,
    )

    return null
  }
  let precision: AnyNode | undefined
  for (const p of (opts.properties as AnyNode[] | undefined) ?? []) {
    if (p?.type !== 'Property' && p?.type !== 'ObjectProperty') {
      ctx.report(
        `${label}: a spread in the options cannot be read, so whether it sets \`precision\` is unknown — the field is NOT email-validated on device. Write \`precision\` inline.`,
      )

      return null
    }
    if (hasDynamicKey(p)) {
      ctx.report(
        `${label}: the computed key \`${dynamicKeyText(p, ctx)}\` in the options cannot be read, so whether it sets \`precision\` is unknown — the field is NOT email-validated on device. Write \`precision\` inline.`,
      )

      return null
    }
    if (staticPropKey(p) === 'precision') precision = p.value as AnyNode | undefined
  }
  if (precision === undefined) return { kind: 'pyreon', precision: 'standard' }
  const lit = unwrapTypeLayers(precision) as AnyNode | undefined
  if (lit?.type === 'Literal' && typeof lit.value === 'string' && EMAIL_PRECISIONS.has(lit.value)) {
    return { kind: 'pyreon', precision: lit.value as 'html5' | 'standard' | 'rfc5322' }
  }
  ctx.report(
    `${label}: \`precision\` is not one of the string literals 'html5' / 'standard' / 'rfc5322', so the tier cannot be read — the field is NOT email-validated on device. Write the precision as a literal.`,
  )

  return null
}
