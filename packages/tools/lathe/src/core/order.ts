/**
 * Locale-independent ordering.
 *
 * Every sort that decides the ORDER of emitted output goes through here, and
 * none may use `String.prototype.localeCompare`. `localeCompare` collates by
 * the HOST's locale, and the published bin runs under node, which honours
 * `LC_ALL`: under Danish collation `aa` sorts as `å` — after `z` — so the same
 * spec regenerated on a Copenhagen laptop and in CI produced different files,
 * and `lathe check` failed on one of them. Bun always reports `en-US`, which is
 * why no test running under it could see the divergence.
 *
 * Code-unit order is what `Array.prototype.sort()` already does with no
 * comparator, so this is the same order the input layer has always used for
 * spec keys; the emitters now agree with it.
 */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
