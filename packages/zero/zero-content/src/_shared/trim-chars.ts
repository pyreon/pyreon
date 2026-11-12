/**
 * Linear-time trimming of a character class from the ends of a string.
 *
 * The regex forms these replace (`/\/+$/`, `/^-+|-+$/g`,
 * `/[\s,.]+$/`) backtrack quadratically: on `'/'.repeat(n) + 'x'` the
 * engine retries the run from every start position before failing at `x`.
 * The inputs are author- or config-supplied (site URLs, base paths, tag
 * names, excerpt text), so every such trim goes through these index walks
 * instead.
 *
 * @internal
 */

/** A set of characters as a string (`'/'`, `'-'`), or a per-character test. */
export type CharMatch = string | ((ch: string) => boolean)

function matcher(chars: CharMatch): (ch: string) => boolean {
  return typeof chars === 'string' ? (ch) => chars.includes(ch) : chars
}

/** Remove every leading character in `chars`. */
export function trimStartChars(value: string, chars: CharMatch): string {
  const hit = matcher(chars)
  let start = 0
  while (start < value.length && hit(value.charAt(start))) start++
  return start === 0 ? value : value.slice(start)
}

/** Remove every trailing character in `chars`. */
export function trimEndChars(value: string, chars: CharMatch): string {
  const hit = matcher(chars)
  let end = value.length
  while (end > 0 && hit(value.charAt(end - 1))) end--
  return end === value.length ? value : value.slice(0, end)
}

/** Remove every leading and trailing character in `chars`. */
export function trimChars(value: string, chars: CharMatch): string {
  return trimEndChars(trimStartChars(value, chars), chars)
}
