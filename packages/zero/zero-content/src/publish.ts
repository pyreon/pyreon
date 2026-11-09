// ─── Publish state — draft + scheduled entries ────────────────────────────
//
// One predicate decides whether a collection entry is public. Every surface
// that can expose an entry asks it: `getCollection` at runtime, and at build
// time the virtual collections module, the search index, the sitemap, the
// RSS feed and llms.txt. A surface that answered on its own is how a draft
// ends up in a public search index while the page itself 404s.
//
// Client-safe: no `node:*`, no Vite.

/**
 * Read a frontmatter date value into epoch milliseconds. YAML reads an
 * unquoted `date: 2026-11-16` as a `Date`; a quoted one, or JSON
 * frontmatter, arrives as a string. A date-only string is UTC midnight
 * (ECMAScript's rule for `YYYY-MM-DD`). Returns `null` when the value is
 * absent or unparseable.
 *
 * @internal exported for testing
 */
export function readPublishTime(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? null : t
  }
  if (typeof value === 'string' && value.length > 0) {
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? null : t
  }
  return null
}

/**
 * Whether an entry is public at `now`: it is not `draft: true`, and, when
 * the collection names a `publishDate` field, that date is not in the
 * future. An entry whose `publishDate` field is missing or unparseable is
 * treated as published — the collection's schema is where a required date
 * is enforced.
 *
 * @example
 * isPublished({ draft: false, date: '2030-01-01' }, 'date') // false until 2030
 */
export function isPublished(
  data: Record<string, unknown>,
  publishDate?: string,
  now: number = Date.now(),
): boolean {
  if (data['draft'] === true) return false
  if (publishDate === undefined) return true
  const t = readPublishTime(data[publishDate])
  return t === null || t <= now
}
