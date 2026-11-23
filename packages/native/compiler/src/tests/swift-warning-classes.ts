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
 * The `swiftc --version` strings (their `Apple Swift version …` part) the gates were validated on with ZERO warnings of
 * any class: the macOS CI runner's (read from its job log) and the maintainer machine's. On one of these EVERY warning
 * fails — an emitter change that introduces a new class is caught, not waved through. On any other toolchain only the
 * known classes fail; the rest is reported (a GitHub annotation and the job summary). When the runner image moves,
 * read the new version from the `Validate emitted Swift (real-SDK typecheck, macOS)` log, confirm the gates pass with
 * no annotation, and add it here.
 */
export const VALIDATED_SWIFTC: readonly string[] = [
  // macos-15 runner (Xcode 16.4), 2026-11-23.
  'Apple Swift version 6.1.2 (swiftlang-6.1.2.1.2 clang-1700.0.13.5)',
  // Xcode 26.x, the maintainer machine, 2026-11-23.
  'Apple Swift version 6.4.2 (swiftlang-6.4.2.1.9 clang-2100.4.1.1)',
]

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
export function classifySwiftWarnings(
  lines: readonly string[],
  toolchain = runningSwiftc(),
  report = true,
): { hard: string[]; advisory: string[] } {
  if (VALIDATED_SWIFTC.includes(toolchain)) return { hard: [...lines], advisory: [] }
  const hard = lines.filter((l) => KNOWN_SWIFT_WARNINGS.some((re) => re.test(l)))
  const advisory = lines.filter((l) => !hard.includes(l))
  if (report && advisory.length > 0) reportAdvisory(advisory, toolchain)

  return { hard, advisory }
}

function reportAdvisory(lines: readonly string[], toolchain: string): void {
  const head = `[zero-warnings] ${lines.length} swiftc diagnostic(s) of a class not yet validated, on ${toolchain || 'an unknown swiftc'} (validated: ${VALIDATED_SWIFTC.join('; ')})`
  const annotations = lines.map((l) => `::warning::${head}: ${l}`).join('\n')
  // vitest captures a test's stdout and reprints it under a header, so an annotation printed here is not guaranteed
  // to reach GitHub. The workflow step names a file (`PYREON_ANNOTATIONS_FILE`) and prints it AFTER vitest exits, from
  // the step itself; the job summary gets the same lines.
  const file = process.env.PYREON_ANNOTATIONS_FILE
  if (file) appendFileSync(file, `${annotations}\n`)
  else process.stdout.write(`${annotations}\n`)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) appendFileSync(summary, `\n### ${head}\n\n${lines.map((l) => `- \`${l}\``).join('\n')}\n`)
}
