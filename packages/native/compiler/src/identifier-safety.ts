// Identifier safety — keep emit syntactically valid in target
// languages that disallow characters JSX / HTML attrs accept.
//
// Swift and Kotlin both require identifier characters for argument
// labels + parameter names: letters, digits, underscore. HTML attrs
// like `data-test`, `aria-label` carry hyphens — emit them verbatim
// and `swiftc -parse` / `kotlinc` reject with `expected ',' separator`.
//
// Coverage-gate analysis (2026-05-21, 525 real `.tsx` files):
// hyphenated attrs were the #1 cause of `swiftc -parse` failures —
// 19 of 30 invalid files. The conversion below + identical wiring on
// the Kotlin emit side closes that bucket.
//
// Convention: kebab-case → camelCase. Matches how React / Vue web
// frameworks have rewritten attrs for years (`data-test` → `dataTest`,
// `aria-label` → `ariaLabel`). The choice is structural, not stylistic:
// camelCase is the only mapping Swift + Kotlin BOTH accept without
// further escaping, AND round-trips back to a recognisable form if a
// future SwiftUI / Compose binding wants the original.

/**
 * Convert a kebab-case identifier to camelCase. Idempotent for
 * inputs without hyphens.
 *
 *   safeIdent('data-test')      → 'dataTest'
 *   safeIdent('aria-label')     → 'ariaLabel'
 *   safeIdent('background')     → 'background'
 *   safeIdent('on-mount-once')  → 'onMountOnce'
 *
 * Trailing or leading hyphens are stripped (defensive — neither HTML
 * nor JSX attr names should start/end with `-`, but the emitter
 * shouldn't crash if a fixture provides one).
 */
export function safeIdent(name: string): string {
  if (!name.includes('-')) return name
  const segments = name.split('-').filter((s) => s.length > 0)
  if (segments.length === 0) return name
  return segments
    .map((seg, i) =>
      i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1),
    )
    .join('')
}
