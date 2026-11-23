import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

/**
 * The swiftc warning classes the zero-warning gates fail on whatever the toolchain. The macOS runner's Xcode is not
 * pinned, so a new compiler can add a diagnostic overnight; off the validated toolchain these classes still fail and
 * anything else is reported (see `classifySwiftWarnings`). A new class is fixed first, then added here.
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
  /'catch' block is unreachable/,
]

/**
 * The `swiftc --version` (its `Apple Swift version …` part) the gates were last validated on with ZERO warnings of any
 * class. On this toolchain EVERY warning fails — an emitter change that introduces a new class is caught here, not
 * waved through as advisory. On any other toolchain only the known classes fail; the rest is reported (a GitHub
 * annotation and the job summary). Revalidate and update this when the CI runner's Xcode moves.
 */
export const VALIDATED_SWIFTC = 'Apple Swift version 6.4.2 (swiftlang-6.4.2.1.9 clang-2100.4.1.1)'

let swiftcVersionCache: string | undefined

/** The running toolchain's `Apple Swift version …` string ('' when swiftc is absent). */
export function runningSwiftc(): string {
  if (swiftcVersionCache === undefined) {
    const r = spawnSync('swiftc', ['--version'], { encoding: 'utf8' })
    swiftcVersionCache = /Apple Swift version [^\n]*?\)/.exec(`${r.stdout ?? ''}${r.stderr ?? ''}`)?.[0] ?? ''
  }

  return swiftcVersionCache
}

/**
 * Split warning lines into the ones that fail and the advisory rest (see {@link VALIDATED_SWIFTC}), reporting the
 * advisory ones as `::warning::` annotations and in `$GITHUB_STEP_SUMMARY` so a new class cannot pass unseen.
 */
export function classifySwiftWarnings(lines: readonly string[], toolchain = runningSwiftc()): { hard: string[]; advisory: string[] } {
  if (toolchain === VALIDATED_SWIFTC) return { hard: [...lines], advisory: [] }
  const hard = lines.filter((l) => KNOWN_SWIFT_WARNINGS.some((re) => re.test(l)))
  const advisory = lines.filter((l) => !hard.includes(l))
  if (advisory.length > 0) reportAdvisory(advisory, toolchain)

  return { hard, advisory }
}

function reportAdvisory(lines: readonly string[], toolchain: string): void {
  const head = `[zero-warnings] ${lines.length} swiftc diagnostic(s) of a class not yet validated, on ${toolchain || 'an unknown swiftc'} (validated: ${VALIDATED_SWIFTC})`
  // stdout, unprefixed: GitHub reads `::warning::` lines from the step's output.
  process.stdout.write(`${lines.map((l) => `::warning::${head}: ${l}`).join('\n')}\n`)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) appendFileSync(summary, `\n### ${head}\n\n${lines.map((l) => `- \`${l}\``).join('\n')}\n`)
}
