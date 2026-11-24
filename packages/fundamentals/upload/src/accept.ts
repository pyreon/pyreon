/** A file's lower-case MIME type without parameters (`image/png; charset=x` is `image/png`). */
const mimeOf = (type: string): string => type.split(';')[0]!.trim().toLowerCase()

/**
 * Does the file match one of the `accept` patterns? Patterns are MIME types (`application/pdf`), wildcards (`image/` plus a star, or a star for anything)
 * and extensions (`.csv`), compared without regard to case, as the `accept` attribute does. An empty list accepts everything.
 * A file with no MIME type matches only an extension or the any-type wildcard.
 *
 * @example matchesAccept({ name: 'a.PNG', type: 'image/png' }, ['image/*']) // => true
 * @example matchesAccept({ name: 'a.exe', type: '' }, ['.png', 'image/*']) // => false
 */
export function matchesAccept(file: { name?: string; type: string }, accept: readonly string[]): boolean {
  if (accept.length === 0) return true
  const type = mimeOf(file.type ?? '')
  const name = (file.name ?? '').toLowerCase()

  return accept.some((raw) => {
    const p = raw.trim().toLowerCase()

    if (p === '' ) return false
    if (p === '*/*' || p === '*') return true
    if (p.startsWith('.')) return name.length > p.length && name.endsWith(p)
    if (p.endsWith('/*')) return type.startsWith(p.slice(0, -1))

    return type === p
  })
}
