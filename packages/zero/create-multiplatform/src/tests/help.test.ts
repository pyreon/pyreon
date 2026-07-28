// `npx create-multiplatform --help` exited 1 and printed nothing to stdout.
//
// `--help` fell through to `parseArgs`, which saw no project name and THREW.
// The usage line went to stderr and the process exited non-zero — so any script
// or CI step checking the exit code treated a help request as a failure, and a
// plain `| grep` saw nothing.
//
// Every other published Pyreon bin (pyreon-lint, zero, create-zero) already
// exits 0 on stdout; this one was the outlier, and it is the FIRST command a
// new user runs.
//
// The bin-liveness gate had special-cased it —
//   "Prints usage to stderr and exits 1 on --help … that IS the liveness signal"
// — which ENCODED the bug rather than catching it. That special case is now
// removed, so a regression fails the gate.

import { describe, expect, it } from 'vitest'
import { USAGE, main, parseArgs, wantsHelp } from '../index'

describe('--help', () => {
  it('is recognised in both spellings, anywhere in argv', () => {
    expect(wantsHelp(['--help'])).toBe(true)
    expect(wantsHelp(['-h'])).toBe(true)
    expect(wantsHelp(['myapp', '--help'])).toBe(true)
    expect(wantsHelp(['myapp'])).toBe(false)
    expect(wantsHelp([])).toBe(false)
  })

  it('resolves instead of throwing, and prints usage to stdout', async () => {
    const lines: string[] = []
    const spy = console.log
    // eslint-disable-next-line no-console
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
      await expect(main(['--help'])).resolves.toBeUndefined()
    } finally {
      // eslint-disable-next-line no-console
      console.log = spy
    }
    expect(lines.join('\n')).toContain(USAGE)
  })

  it('does NOT scaffold anything when help is requested', async () => {
    // `--help` used to reach parseArgs; the guard must short-circuit BEFORE
    // any validation or filesystem work.
    await expect(main(['--help'])).resolves.toBeUndefined()
  })

  // The invariant the old behaviour was protecting, kept intact: a genuine
  // missing project name is still an error.
  it('still throws when no project name is given', () => {
    expect(() => parseArgs([])).toThrow(USAGE)
    expect(() => parseArgs(['--dir', 'somewhere'])).toThrow(USAGE)
  })

  it('shares ONE usage string between the help and error paths', () => {
    // Two copies would drift; the error path must quote the same text help does.
    expect(() => parseArgs([])).toThrow(USAGE)
    expect(USAGE).toContain('create-multiplatform')
  })
})
