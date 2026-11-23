/**
 * Whether `name` is a valid server-island name. The ONE rule, used by
 * `serverIsland()` at registration, by the browser before it fetches a
 * marker's fragment, and by zero's fragment endpoint — so the three can
 * never disagree (a name registration accepts and the endpoint 400s left an
 * island on its fallback with no error).
 *
 * A name becomes the last segment of `<base>/_pyreon/fragment/<name>`,
 * escaped with `encodeURIComponent`. **Escaping into one path segment is not
 * a containment boundary: an intermediary may decode it.** A reverse proxy in
 * the usual sub-path setup (nginx `location /sub/ { proxy_pass http://app/; }`)
 * forwards the NORMALISED URI — `%2F` decoded, `..` resolved — so a marker
 * named `../../api/x` would be fetched as another path of the app (or above
 * `/sub/`), and its response inserted as HTML. So the name must stay a single
 * segment even after decoding:
 *
 * - no `/`, `\` or `%` (nothing that decodes, or is, a separator);
 * - no control character (C0, DEL, C1), no U+2028/U+2029, no format
 *   character (`\p{Cf}`: bidi overrides, zero-width characters);
 * - the same after NFKC normalisation (`．．／` is `../`);
 * - not empty, and not made only of dots (`.`, `..`, `...` are dot segments
 *   or suspicious to every normaliser).
 *
 * Spaces, `:`, `?`, `#` and unicode stay allowed: they are escaped, and no
 * normaliser turns them into a separator.
 */
export function isIslandName(name: string): boolean {
  // The same rule on the NFKC form too: look-alikes such as `．`/`／` (U+FF0E,
  // U+FF0F), `․` (U+2024), `﹒` (U+FE52) and `％` (U+FF05) normalise to `.`,
  // `/` and `%`, and an intermediary that normalises would see those.
  return passes(name) && passes(name.normalize('NFKC'))
}

function passes(name: string): boolean {
  return (
    name !== '' &&
    !/^\.+$/.test(name) &&
    // Separators, `%`, C0/C1 controls and DEL, line/paragraph separators, and
    // format characters (bidi overrides, zero-width joiners …).
    // oxlint-disable-next-line no-control-regex -- control characters are exactly what is refused
    !/[/\\%\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Cf}]/u.test(name)
  )
}
