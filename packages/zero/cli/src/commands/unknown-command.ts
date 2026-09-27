/**
 * Guard for the default command's `[root]` positional.
 *
 * `zero [root]` starts the dev server in `root`, so any word that is not a
 * subcommand lands there — `zero biuld` used to start a dev server treating
 * `biuld` as a project directory (which Vite then served as an empty app).
 * A root that is not an existing directory is almost always a mistyped
 * command, so it is rejected with the nearest command name instead.
 */
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

/** Every subcommand name, for the suggestion. */
export const ZERO_COMMANDS = ['dev', 'build', 'preview', 'doctor', 'context', 'create'] as const

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Levenshtein distance — the inputs are single CLI words, so O(n·m) is fine. */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return prev[b.length]!
}

/** The closest command to `word`, or `undefined` when none is close. */
export function nearestCommand(word: string): string | undefined {
  let best: string | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const command of ZERO_COMMANDS) {
    const d = distance(word.toLowerCase(), command)
    if (d < bestDistance) {
      best = command
      bestDistance = d
    }
  }
  // Two edits covers transpositions and a dropped/extra letter; beyond
  // that a suggestion is more likely to mislead than help.
  return bestDistance <= 2 ? best : undefined
}

/**
 * The error message for a `root` positional that is not a directory, or
 * `null` when `root` is absent or a real directory.
 */
export function checkRootArg(root: string | undefined, cwd = process.cwd()): string | null {
  if (root === undefined || isDirectory(resolve(cwd, root))) return null
  const suggestion = nearestCommand(root)
  return suggestion
    ? `[Pyreon] "${root}" is not a zero command or a directory. Did you mean "zero ${suggestion}"?`
    : `[Pyreon] "${root}" is not a zero command or a directory. Run "zero --help" for the list of commands.`
}
