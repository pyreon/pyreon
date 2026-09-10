/**
 * The `check` command's exit code, its two output modes, and `--help`.
 *
 * `pyreon-native check` is meant to be a CI gate, so its EXIT CODE is the
 * product: 2 when the source has errors, 0 when it does not. Nothing
 * asserted that. A `check` that found errors and still exited 0 would make
 * every pipeline using it silently green — the single most consequential
 * thing this binary can get wrong, and it was untested.
 *
 * The reporting layer around it (`printFinding` / `reportCheck`) was
 * unreached entirely, and it carries three contracts that fail quietly:
 *
 *   * **Stream routing.** Errors go to stderr, warnings to stdout's warn
 *     channel. A finding written to the wrong stream still *appears* in a
 *     terminal, so it looks fine — and breaks the moment someone pipes or
 *     redirects one of them, which is exactly what CI does.
 *   * **The `file:line:col` form.** That is the editor-clickable shape; a
 *     regression to a bare filename loses click-to-jump with no error
 *     anywhere. Warnings are deliberately position-less and must NOT have
 *     one fabricated.
 *   * **`--json`.** The machine surface. It must be the ONLY thing on
 *     stdout in that mode, or a consumer's `JSON.parse` fails on the human
 *     summary line printed beside it.
 *
 * `--help` has a contract written into a comment above `printUsage` and no
 * test: it is a SUCCESSFUL request, so stdout + exit 0. `npx pyreon-native
 * --help` exiting 1 breaks any script that checks the code, and usage on
 * stderr is invisible to a plain `| grep`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../cli'

/** A component that lowers cleanly to both targets. */
const CLEAN = 'export function C() { return <text>hello</text> }'
/** A generic function — outside the PMTC subset, so it warns without erroring. */
const WARNS =
  'function first<T>(xs: T[]): T { return xs[0] }\nexport function C() { return <text>hi</text> }'
/** Unparseable: the transform throws, which becomes an `error` finding. */
const BROKEN = 'export function C() { return <text>oops< }'

let dir: string
let outDir: string
let logs: string[]
let warns: string[]
let errs: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-cli-check-'))
  outDir = mkdtempSync(join(tmpdir(), 'pyreon-cli-check-out-'))
  logs = []
  warns = []
  errs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')))
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => warns.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => errs.push(a.join(' ')))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(outDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const write = (name: string, code: string): void => writeFileSync(join(dir, name), code, 'utf8')

describe('check exits with the code CI reads', () => {
  it('returns 0 for a clean source tree', () => {
    // The control. Without it, "returns 2 on errors" passes against a
    // command that returns 2 unconditionally.
    write('App.tsx', CLEAN)
    expect(main(['check', `--source=${dir}`])).toBe(0)
  })

  it('returns 2 when a file fails to transform', () => {
    // The whole point of the command. A `check` that finds errors and
    // exits 0 makes every pipeline using it silently green.
    write('Broken.tsx', BROKEN)
    expect(main(['check', `--source=${dir}`])).toBe(2)
  })

  it('returns 0 for warnings alone — a warning is not a gate failure', () => {
    // The distinction is the reason both counts exist. Failing CI on
    // "this shape is outside the subset" would make the command unusable
    // on any real codebase.
    write('Warns.tsx', WARNS)
    expect(main(['check', `--source=${dir}`])).toBe(0)
    expect(warns.join('\n'), 'but the warning must still be reported').toContain('Warns.tsx')
  })

  it('returns 1 — not 2 — when --source is missing', () => {
    // A usage error and a failed check are different outcomes, and a
    // caller branching on the code needs to tell them apart.
    expect(main(['check'])).toBe(1)
    expect(errs.join('\n')).toContain('--source')
  })

  it('returns 2 when the source path does not exist', () => {
    expect(main(['check', '--source=/nonexistent/pyreon/path'])).toBe(2)
    expect(errs.join('\n')).toContain('check failed')
  })

  it('accepts a single FILE, not just a directory', () => {
    // The usage line advertises "a .tsx file or a directory".
    write('One.tsx', CLEAN)
    expect(main(['check', `--source=${join(dir, 'One.tsx')}`])).toBe(0)
    expect(logs.join('\n')).toContain('checked 1 file(s)')
  })
})

describe('findings are routed to the right stream and carry a position', () => {
  it('an ERROR goes to stderr with an editor-clickable file:line:col', () => {
    // Wrong-stream output still shows up in a terminal, so this only
    // breaks once someone redirects — i.e. in CI, far from the change.
    write('Broken.tsx', BROKEN)
    main(['check', `--source=${dir}`, '--target=ios'])

    const line = errs.find((l) => l.includes('Broken.tsx'))
    expect(line, 'the error must be on stderr').toBeDefined()
    expect(line, 'and marked as an error').toContain('✗')
    expect(line, 'with a line:col an editor can jump to').toMatch(/Broken\.tsx:\d+:\d+/)
    expect(warns.join('\n'), 'and NOT on the warn channel').not.toContain('Broken.tsx')
  })

  it('a WARNING goes to the warn channel with a BARE filename', () => {
    // Warnings are position-less today, and a fabricated position would
    // send the reader to an arbitrary line.
    write('Warns.tsx', WARNS)
    main(['check', `--source=${dir}`, '--target=ios'])

    const line = warns.find((l) => l.includes('Warns.tsx'))
    expect(line).toBeDefined()
    expect(line, 'warnings are marked, not error-glyphed').toContain('!')
    expect(line, 'no position may be invented').not.toMatch(/Warns\.tsx:\d+:\d+/)
    expect(errs.join('\n')).not.toContain('Warns.tsx')
  })

  it('names the TARGET on every finding', () => {
    // A shape can lower on one platform and not the other; a finding that
    // does not say which is not actionable.
    write('Warns.tsx', WARNS)
    main(['check', `--source=${dir}`, '--target=ios'])
    expect(warns.find((l) => l.includes('Warns.tsx'))).toContain('[swift]')
  })

  it('checks BOTH targets when --target is omitted', () => {
    // The documented DX default — you want to know if the component works
    // everywhere, not just on the platform you happen to be building.
    write('Warns.tsx', WARNS)
    main(['check', `--source=${dir}`])
    const all = warns.join('\n')
    expect(all).toContain('[swift]')
    expect(all).toContain('[kotlin]')
    expect(logs.join('\n')).toContain('swift, kotlin')
  })
})

describe('--json is a machine surface', () => {
  it('emits ONE parseable object and no human summary beside it', () => {
    // A consumer runs `check --json | jq`. The summary line printed in
    // text mode would make that fail, so it must be suppressed here.
    write('Warns.tsx', WARNS)
    const code = main(['check', `--source=${dir}`, '--target=ios', '--json'])

    expect(code).toBe(0)
    expect(logs, 'exactly one line on stdout').toHaveLength(1)
    const parsed = JSON.parse(logs[0]!) as {
      filesChecked: number
      targets: string[]
      errorCount: number
      warningCount: number
      findings: unknown[]
      skippedWebEntries: unknown[]
    }
    expect(parsed.filesChecked).toBe(1)
    expect(parsed.targets).toEqual(['swift'])
    expect(parsed.errorCount).toBe(0)
    expect(parsed.warningCount).toBeGreaterThanOrEqual(1)
    expect(parsed.findings.length).toBeGreaterThanOrEqual(1)
  })

  it('reports errorCount AND still exits 2 in json mode', () => {
    // The exit code must not depend on the output format — a CI step that
    // adds `--json` to capture the report would otherwise stop failing.
    write('Broken.tsx', BROKEN)
    const code = main(['check', `--source=${dir}`, '--target=ios', '--json'])
    expect(code).toBe(2)
    const parsed = JSON.parse(logs[0]!) as { errorCount: number }
    expect(parsed.errorCount).toBeGreaterThan(0)
  })

  it('does not print findings to the human streams in json mode', () => {
    write('Broken.tsx', BROKEN)
    main(['check', `--source=${dir}`, '--target=ios', '--json'])
    expect(errs.join('\n'), 'the JSON already carries them').not.toContain('✗')
  })
})

describe('--help is a successful request', () => {
  for (const flag of ['--help', '-h']) {
    it(`${flag} exits 0 and writes usage to STDOUT`, () => {
      // Both halves are load-bearing and both are documented above
      // `printUsage`: exiting 1 breaks any script checking the code, and
      // usage on stderr is invisible to `| grep`.
      const code = main([flag])
      expect(code, 'help is not an error').toBe(0)
      expect(logs.join('\n'), 'usage belongs on stdout').toContain('pyreon-native')
      expect(errs, 'and nothing on stderr').toEqual([])
    })
  }

  it('--help wins over an otherwise-invalid invocation', () => {
    // `pyreon-native build --help` is how people discover the flags they
    // are missing; erroring on the missing flags instead is useless.
    expect(main(['build', '--help'])).toBe(0)
    expect(errs).toEqual([])
  })

  it('an UNKNOWN command prints usage to stderr and exits 1', () => {
    // The mirror: a real error keeps the non-zero code and the error
    // stream, so `--help`'s special-casing is visibly a special case.
    expect(main(['frobnicate'])).toBe(1)
    expect(errs.join('\n')).toContain('pyreon-native')
    expect(logs, 'usage must NOT go to stdout on the error path').toEqual([])
  })
})

describe('argument parsing accepts both flag forms', () => {
  it('--key value (space-separated) works as well as --key=value', () => {
    // Both forms are implemented and only the `=` form was ever tested.
    // A regression in the space-separated branch silently ignores every
    // flag written that way, and the command then fails on a MISSING
    // argument the user plainly supplied.
    write('App.tsx', CLEAN)
    expect(main(['check', '--source', dir, '--target', 'ios'])).toBe(0)
    expect(logs.join('\n')).toContain('[swift]')
  })

  it('a trailing --key with no value does not consume past the end', () => {
    // `check --source` with the value forgotten must report the missing
    // argument, not read `undefined` as a path and fail obscurely.
    expect(main(['check', '--source'])).toBe(1)
    expect(errs.join('\n')).toContain('--source')
  })

  it('bare positional arguments after the command are ignored', () => {
    write('App.tsx', CLEAN)
    expect(main(['check', 'stray', `--source=${dir}`, '--target=ios'])).toBe(0)
  })
})
