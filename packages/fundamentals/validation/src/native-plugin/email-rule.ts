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
 * as one unit. The rfc5322 tier's limits are: local part ≤ 64 (ASCII-only, so
 * a lookahead counts it exactly) and total ≤ 254 UTF-16 units, which the
 * emitter checks as `utf16.count` / `length` — the web's `value.length`. The
 * web's domain ≤ 255 limit is implied by total ≤ 254, so it needs no check.
 *
 * Parity is asserted by EXECUTING these patterns on both toolchains against
 * `@pyreon/validate` itself (`native-email-rule-parity.test.ts`).
 */

/** A domain label's first char (no hyphen, no combining mark). */
const LABEL_START = String.raw`\p{L}\p{Nd}`
/** Any domain label char. */
const LABEL_CHAR = String.raw`\p{L}\p{M}\p{Nd}\-`

const LOCAL_STD = String.raw`(?!\.)(?!.*\.\.)[A-Za-z0-9\_\'\+\.\-]*[A-Za-z0-9\_\+\-]`
const DOMAIN_STD = String.raw`(?:[${LABEL_START}][${LABEL_CHAR}]*\.)+\p{L}[\p{L}\p{M}]+`

/** `.email()` / `.email({ precision: 'standard' })` — `EMAIL_RE`. */
export const EMAIL_STANDARD_PATTERN = `^${LOCAL_STD}@${DOMAIN_STD}\\z`

/** `.email({ precision: 'rfc5322' })` — `EMAIL_RE` + local ≤ 64 (total ≤ 254 is checked by the emitter). */
export const EMAIL_RFC5322_PATTERN = `^(?=[^@]{1,64}@)${LOCAL_STD}@${DOMAIN_STD}\\z`

const HTML5_LABEL = String.raw`[${LABEL_START}](?:[${LABEL_CHAR}]{0,61}[\p{L}\p{M}\p{Nd}])?`

/** `.email({ precision: 'html5' })` — `EMAIL_HTML5_RE`. */
export const EMAIL_HTML5_PATTERN =
  String.raw`^[a-zA-Z0-9\.\!\#\$\%\&\'\*\+\/\=\?\^\_\`\{\|\}\~\-]+@` + `${HTML5_LABEL}(?:\\.${HTML5_LABEL})*\\z`

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
