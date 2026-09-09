// ─── Inline suppression for the detectors ────────────────────────────────────
//
// `detectPyreonPatterns` / `detectReactPatterns` are pattern matchers without
// a type checker, so a small number of their findings are correct code the
// pattern cannot tell apart. `@pyreon/router`'s `RouterView` is the standing
// example: it ends on `child as unknown as VNodeChild`, which the
// `as-unknown-as-vnodechild` detector flags on the premise that a JSX.Element
// is already assignable — true, and `child` there is `VNodeChild | null`, a
// union no `h()` overload accepts in rest position, so removing the cast is a
// TS2769. A comment beside it had argued that since the detector shipped, and
// the finding was reported on every run regardless.
//
// A detector with no local escape hatch leaves two options, and both are bad:
// carry a permanent false positive, or change correct code to quiet a tool.
// `@pyreon/lint` solved this long ago, so this reuses ITS convention verbatim
// rather than inventing a second one — the same comment silences a lint rule
// and a detector, and a reader does not have to know which produced a finding.
//
// The one addition is that the PREFIXED id works too. The doctor prints
// `pyreon-patterns/as-unknown-as-vnodechild`; a suppression syntax that
// rejects the id the tool just showed you is a papercut, so both spellings
// are accepted.

/**
 * The lint runner's syntax, matched exactly (`runner.ts`):
 *
 *   // pyreon-lint-ignore                        — everything on the next line
 *   // pyreon-lint-ignore <id>                   — one id
 *   // pyreon-lint-disable-next-line             — alias
 *   // pyreon-lint-disable-next-line <id>        — alias
 *
 * Whole-line only, so `// pyreon-lint-ignored` (a typo) is not a suppression.
 */
const SUPPRESS_RE = /^\/\/\s*pyreon-lint-(?:ignore|disable-next-line)(?:\s+(\S+))?\s*$/

/** Ids that silence a finding with this `code`: the bare code and its gate-prefixed form. */
function accepts(id: string, code: string, prefix: string): boolean {
  return id === code || id === `${prefix}/${code}`
}

/**
 * Drop the diagnostics suppressed by a comment on the line ABOVE them.
 *
 * @param prefix the gate namespace the doctor prints (`pyreon-patterns`, `react-patterns`)
 */
export function filterSuppressed<T extends { code: string; line: number }>(
  diagnostics: readonly T[],
  source: string,
  prefix: string,
): T[] {
  // A file with no suppression comment at all is the overwhelming case, and
  // splitting a large source per call is not free.
  if (!source.includes('pyreon-lint-')) return [...diagnostics]
  const lines = source.split('\n')
  return diagnostics.filter((d) => {
    const prev = lines[d.line - 2]
    if (prev === undefined) return true
    const match = SUPPRESS_RE.exec(prev.trim())
    if (match === null) return true
    const id = match[1]
    // Bare suppression → everything on the next line.
    if (id === undefined) return false
    return !accepts(id, d.code, prefix)
  })
}
