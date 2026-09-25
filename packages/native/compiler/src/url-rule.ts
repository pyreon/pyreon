/**
 * The web's URL rules, spelled for NSRegularExpression (ICU) and
 * java.util.regex so a device reaches the SAME verdict the browser does.
 *
 * The obvious transliteration is wrong in three places, each of which makes a
 * device accept or reject what the web does not:
 *
 * - `\s` differs. JS: TAB, VT, FF, SP, NBSP, the Zs block, LF, CR, U+2028,
 *   U+2029 and U+FEFF. ICU's `\s` has no VT and no U+FEFF; Java's (without
 *   UNICODE_CHARACTER_CLASS) is ASCII only. So the JS set is written out.
 * - `.` differs. JS excludes LF, CR, U+2028, U+2029; ICU and Java also exclude
 *   U+0085. So `.` is written as the JS set's complement.
 * - `$` differs. JS (no `m` flag) matches only at the end; ICU and Java also
 *   match BEFORE a final line terminator, so `"https://x.io\n"` would pass on
 *   device. `\z` is the end in all three.
 *
 * And the web's case-insensitive `https?` becomes explicit classes rather than
 * a case-insensitive flag, because ICU folds `ſ` (U+017F) to `s` where JS does
 * not.
 *
 * Every escape is `\uXXXX`, which ICU and Java both read inside a pattern, so
 * one string serves both targets. Parity is asserted by EXECUTING these
 * patterns on both toolchains against the web's own `URL_RE` / `URI_RE`
 * (`native-url-rule-parity.test.ts`).
 */

/** `\uXXXX` for a code point -- the escape ICU and java.util.regex both read. */
const u = (cp: number): string => `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`

/**
 * The members of JavaScript's `\s`, as a character-class body. Built from code
 * points rather than written as escapes in this file, so no raw separator
 * character can ever end up in the emitted source.
 */
const JS_WS = [
  ...[0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680].map(u),
  `${u(0x2000)}-${u(0x200a)}`,
  ...[0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff].map(u),
].join('')

/** JavaScript's `.` without the `s` flag: anything but a line terminator. */
const JS_DOT = `[^${[0x0a, 0x0d, 0x2028, 0x2029].map(u).join('')}]`

/** `@pyreon/validate`'s `URL_RE` (`/^https?:\/\/[^\s/$.?#].[^\s]*$/i`). */
export const HTTP_URL_PATTERN = String.raw`^[hH][tT][tT][pP][sS]?://[^${JS_WS}/$.?#]${JS_DOT}[^${JS_WS}]*\z`

/**
 * `@pyreon/validate`'s `URI_RE` (`/^([A-Za-z][A-Za-z0-9+.-]*):\S*$/`). The
 * scheme is the text before the FIRST colon -- a scheme cannot contain one --
 * and is tested against the `protocol` pattern separately, as the web does.
 */
export const URI_PATTERN = String.raw`^[A-Za-z][A-Za-z0-9+.-]*:[^${JS_WS}]*\z`
