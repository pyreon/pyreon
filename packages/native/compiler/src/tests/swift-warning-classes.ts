/**
 * The swiftc warning classes the zero-warning gates FAIL on. The macOS runner's Xcode is not pinned, so a new compiler
 * can add a diagnostic overnight; a gate fails hard only on these classes (the ones the emitters and the runtime were
 * cleaned of) and reports anything else as advisory, so a runner-image update cannot red an unrelated PR. A new class
 * is fixed first, then added here.
 */
export const KNOWN_SWIFT_WARNINGS: readonly RegExp[] = [
  /was never used; consider replacing with '_'/,
  /was never mutated; consider changing to 'let'/,
  /left side of nil coalescing operator '\?\?' has non-optional type/,
  /comparing non-optional value of type .* to 'nil' always returns false/,
  /does not need to be escaped in argument list/,
  /'onChange\(of:perform:\)' was deprecated/,
  /in concurrently-executing code/,
  /string interpolation produces a debug description for an optional value/,
]

/** Split warning lines into the ones that fail (known classes) and the advisory rest. */
export function classifySwiftWarnings(lines: readonly string[]): { hard: string[]; advisory: string[] } {
  const hard = lines.filter((l) => KNOWN_SWIFT_WARNINGS.some((re) => re.test(l)))
  return { hard, advisory: lines.filter((l) => !hard.includes(l)) }
}
