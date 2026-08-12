/**
 * What the prerender pass ACTUALLY produced — recorded by the SSG plugin,
 * read by the build summary.
 *
 * The summary used to derive its page count by walking `dist` for `.html`
 * files. That is wrong in exactly the case that matters: when a route fails to
 * prerender, the untouched client shell is still sitting on disk, so it counts
 * as a rendered page. A build that rendered four of five pages reported
 *
 *     ○ 5 prerendered pages (2.20 MB html)
 *
 * and exited 0, while one of those "pages" was a 356-byte empty shell. The
 * failure existed only in a `console.error` above the summary and in
 * `dist/_pyreon-ssg-errors.json`, which nothing reads.
 *
 * Continuing past a failed path is deliberate — one bad route should not kill
 * a thousand-page build, which is what `ssg.onPathError` and the errors
 * artifact are for. Reporting it as a success is not. This module carries the
 * real numbers the short distance between the two plugins so the summary can
 * say what happened.
 *
 * Module state rather than a `globalThis` seam: both plugins live in THIS
 * package and run in the same process within one build, so there is no
 * instance boundary to cross. `resetSsgOutcome` exists because a single
 * process can run more than one build (tests, a watcher, the nested SSR
 * sub-build) and a stale outcome would be worse than none.
 */

export interface SsgOutcome {
  /** Paths that produced real HTML. */
  rendered: number
  /** Paths whose render threw; their shells may still be on disk. */
  failed: number
  /** Where the failures are recorded, when the artifact was written. */
  errorArtifact?: string
}

let current: SsgOutcome | undefined

export function recordSsgOutcome(outcome: SsgOutcome): void {
  current = outcome
}

export function readSsgOutcome(): SsgOutcome | undefined {
  return current
}

export function resetSsgOutcome(): void {
  current = undefined
}
