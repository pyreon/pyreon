/**
 * The `zero` argv parser against the behaviour `cac` had (see
 * `cac-recorded.ts`): which command runs and with what arguments, which argv
 * is rejected and with what message, and what `--help` / `--version` print.
 */
import { describe, expect, it } from 'vitest'
import { CliUsageError, runCli } from '../argv'
import { type ZeroHandlers, zeroCli } from '../cli'
import { ERRORS, HELP, HELP_AND_VERSION_ARGV, RUNS, VERSION_ARGV } from './cac-recorded'

function harness() {
  const calls: Array<{ name: string; args: unknown[] }> = []
  const printed: string[] = []
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args })
    }
  const handlers: ZeroHandlers = {
    dev: rec('dev'),
    build: rec('build'),
    preview: rec('preview'),
    doctor: rec('doctor'),
    context: rec('context'),
    create: rec('create'),
  }
  const run = (argv: string[]) => runCli(zeroCli('9.9.9', handlers), argv, (t) => printed.push(t))
  return { calls, printed, run }
}

describe('zero argv — commands run with the arguments cac passed', () => {
  it.each(RUNS)('%j → %s', (argv, name, args) => {
    const h = harness()
    h.run(argv)
    expect(h.printed).toEqual([])
    expect(h.calls).toEqual([{ name, args }])
  })
})

describe('zero argv — rejected argv, with cac’s messages', () => {
  it.each(ERRORS)('%j', (argv, message) => {
    const h = harness()
    expect(() => h.run(argv)).toThrow(CliUsageError)
    expect(() => h.run(argv)).toThrow(message)
    expect(h.calls).toEqual([])
  })
})

describe('zero argv — help and version', () => {
  for (const [argvs, text] of HELP) {
    for (const argv of argvs) {
      it(`${JSON.stringify(argv)} prints the help cac printed`, () => {
        const h = harness()
        h.run(argv)
        expect(h.calls).toEqual([])
        expect(h.printed).toEqual([text])
      })
    }
  }

  it.each(VERSION_ARGV)('%j prints name/version and the runtime', (...argv) => {
    const h = harness()
    h.run(argv)
    expect(h.calls).toEqual([])
    expect(h.printed).toHaveLength(1)
    expect(h.printed[0]).toMatch(
      new RegExp(`^zero/9\\.9\\.9 ${process.platform}-${process.arch} (node|bun|deno)-${process.version.replace(/\./g, '\\.')}$`),
    )
  })

  it('-v --help prints the default help, then the version line', () => {
    const h = harness()
    h.run(HELP_AND_VERSION_ARGV)
    expect(h.calls).toEqual([])
    expect(h.printed).toHaveLength(2)
    expect(h.printed[0]).toBe(HELP.find(([argvs]) => argvs.some((a) => a.join(' ') === '--help'))?.[1])
    expect(h.printed[1]).toMatch(/^zero\/9\.9\.9 /)
  })

  it('covers every recorded argv', () => {
    const count =
      RUNS.length + ERRORS.length + HELP.reduce((n, [a]) => n + a.length, 0) + VERSION_ARGV.length + 1
    expect(count).toBe(72)
  })
})

describe('zero argv — the action return value is passed through', () => {
  it('returns what the matched action returns (dev is async)', () => {
    const promise = Promise.resolve('started')
    const result = runCli(
      zeroCli('1.0.0', {
        dev: () => promise,
        build: () => null,
        preview: () => null,
        doctor: () => null,
        context: () => null,
        create: () => null,
      }),
      [],
    )
    expect(result).toBe(promise)
  })
})
