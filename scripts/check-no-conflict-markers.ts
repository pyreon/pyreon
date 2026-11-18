#!/usr/bin/env bun
/**
 * Fail when a tracked text file contains git merge-conflict markers.
 *
 * A conflict "resolved" by committing the file as git left it is easy to miss
 * in review when the file is not code a gate compiles: a shell script, a YAML
 * file, a Markdown page. `examples/native-counter/scripts/xcode-setup.sh` sat
 * on the default branch with three unresolved hunks, so the script could not
 * run, and nothing reported it.
 *
 * Only the opening and closing markers are matched (`<<<<<<< ref` and
 * `>>>>>>> ref`, seven or eight characters: a rename conflict writes eight).
 * A bare `=======` line is not, because it is also a Markdown heading rule.
 * Each marker line must be followed by a ref, which keeps prose and ASCII art
 * out. A file that documents markers on purpose can spell them inside a code
 * span or indent them: both miss the start-of-line match.
 *
 * Usage: bun scripts/check-no-conflict-markers.ts
 */
import { spawnSync } from 'node:child_process'

/** Start-of-line `<<<<<<< ref` or `>>>>>>> ref`. */
export const CONFLICT_MARKER = /^(?:<{7,8}|>{7,8}) \S/

/** 1-based line numbers of conflict markers in `text`. */
export function findConflictMarkers(text: string): number[] {
  const hits: number[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (CONFLICT_MARKER.test(lines[i] ?? '')) hits.push(i + 1)
  }

  return hits
}

if (import.meta.main) {
  // `-I` skips binary files; the pattern is the same expression in POSIX ERE.
  const res = spawnSync('git', ['grep', '-nIE', '^(<{7,8}|>{7,8}) [^[:space:]]', '--', '.'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  // git grep exits 1 when nothing matches, and >1 on a real error.
  if (res.status !== 0 && res.status !== 1) {
    console.error(`[check-no-conflict-markers] git grep failed:\n${res.stderr}`)
    process.exit(1)
  }
  const hits = res.stdout.split('\n').filter((l) => l.length > 0)
  if (hits.length > 0) {
    console.error(
      `[check-no-conflict-markers] ${hits.length} merge-conflict marker(s) in tracked files:\n` +
        hits.map((h) => `  ${h.slice(0, 160)}`).join('\n') +
        '\n\nResolve each conflict (keep one side, or combine them) and delete the marker lines.',
    )
    process.exit(1)
  }
  console.log('[check-no-conflict-markers] no merge-conflict markers in tracked files')
}
