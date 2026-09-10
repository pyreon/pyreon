/**
 * The `assets` command through `main`, and the flags nothing parsed.
 *
 * `assets` is one of five commands the binary dispatches and the only one
 * with no test at any level above the materializer it calls. The
 * materializer is well covered; the CLI wrapper around it — target
 * validation, required arguments, the failure path — was not, so a
 * regression in the wrapper would leave a well-tested engine that no
 * invocation can reach.
 *
 * The boolean flags are the other gap. `parseArgs` handles `--typecheck`,
 * `--watch`, `--lsp` and `--json` as value-less flags that must NOT consume
 * the following argument, and only `--json` had ever been exercised. That
 * distinction is the bug-prone part: if one of them fell through to the
 * `--key value` branch it would swallow the next argument, so
 * `check --typecheck --source ./src` would silently lose `--source` and
 * report a MISSING argument the user plainly supplied.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../cli'

let assetsDir: string
let out: string
let srcDir: string
let logs: string[]
let errs: string[]

beforeEach(() => {
  assetsDir = mkdtempSync(join(tmpdir(), 'pyreon-cli-assets-'))
  out = mkdtempSync(join(tmpdir(), 'pyreon-cli-assets-out-'))
  srcDir = mkdtempSync(join(tmpdir(), 'pyreon-cli-src-'))
  logs = []
  errs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => errs.push(a.join(' ')))
})

afterEach(() => {
  for (const d of [assetsDir, out, srcDir]) rmSync(d, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const putAsset = (name: string): void => writeFileSync(join(assetsDir, name), 'png-bytes')

describe('the assets command reaches its materializer', () => {
  for (const target of ['ios', 'android', 'web'] as const) {
    it(`--target=${target} materializes and returns 0`, () => {
      // Each target has its own output layout; running only one would
      // leave two of three dispatch arms unreached.
      putAsset('logo.png')
      putAsset('logo@2x.png')
      const code = main(['assets', `--target=${target}`, `--source=${assetsDir}`, `--out=${out}`])

      expect(code).toBe(0)
      expect(readdirSync(out).length, 'something must actually be written').toBeGreaterThan(0)
      expect(logs.join('\n')).toContain('materialized')
    })
  }

  it('rejects a target that is not ios | android | web', () => {
    // `swift` is a valid BUILD target and not an assets one — the kind of
    // near-miss that must fail loudly rather than pick a default.
    expect(main(['assets', '--target=swift', `--source=${assetsDir}`, `--out=${out}`])).toBe(1)
    expect(errs.join('\n')).toContain('ios | android | web')
  })

  it('requires a target at all', () => {
    expect(main(['assets', `--source=${assetsDir}`, `--out=${out}`])).toBe(1)
  })

  it('requires --source and --out', () => {
    expect(main(['assets', '--target=ios', `--out=${out}`])).toBe(1)
    expect(main(['assets', '--target=ios', `--source=${assetsDir}`])).toBe(1)
    expect(errs.join('\n')).toContain('--source')
  })

  it('returns 2 — not 1 — when materializing FAILS', () => {
    // A usage error and a failed run are different outcomes. A caller
    // branching on the code (retry vs. fix the invocation) needs them
    // apart, and a missing source dir is a run failure, not a usage one.
    const code = main(['assets', '--target=ios', '--source=/nonexistent/pyreon/assets', `--out=${out}`])
    expect(code).toBe(2)
    expect(errs.join('\n')).toContain('assets failed')
  })
})

describe('value-less flags do not swallow the next argument', () => {
  const CLEAN = 'export function C() { return <text>hi</text> }'

  it('--typecheck before a space-separated --source keeps the source', () => {
    // If `--typecheck` fell through to the `--key value` branch it would
    // consume `--source`, and the command would report a MISSING argument
    // the user plainly supplied — the most confusing failure a CLI has.
    //
    // NOTE the assertion is that the SOURCE was seen, not that the exit
    // code is 0. `--typecheck` shells out to swiftc where the SDK exists,
    // so the code depends on the machine — asserting 0 would pass on
    // ubuntu and fail on a Mac, which is the same un-satisfiable shape
    // that made this package's coverage floor platform-dependent. What
    // the parser owns is whether the argument survived, and that is
    // identical everywhere.
    writeFileSync(join(srcDir, 'App.tsx'), CLEAN, 'utf8')
    main(['check', '--typecheck', '--source', srcDir, '--target', 'ios'])
    expect(errs.join('\n'), 'the source must have been seen').not.toContain('requires --source')
    expect(logs.join('\n'), 'and the run reached the summary').toContain('checked 1 file(s)')
  })

  it('--typecheck adds the type-check tally to the summary', () => {
    // The flag has to reach `reportCheck`, not merely parse. Off-macOS
    // every file is reported as skipped, which is the honest answer
    // rather than a silent pass.
    writeFileSync(join(srcDir, 'App.tsx'), CLEAN, 'utf8')
    main(['check', `--source=${srcDir}`, '--target=ios', '--typecheck'])
    expect(logs.join('\n'), 'the tally only prints when --typecheck is on').toContain(
      'type-check skipped',
    )
  })

  it('WITHOUT --typecheck the tally is absent', () => {
    // The control. Without it the spec above passes against a summary that
    // always prints the tally, which would be noise on every run.
    writeFileSync(join(srcDir, 'App.tsx'), CLEAN, 'utf8')
    main(['check', `--source=${srcDir}`, '--target=ios'])
    expect(logs.join('\n')).not.toContain('type-check skipped')
  })

  it('--json before a space-separated flag keeps that flag', () => {
    writeFileSync(join(srcDir, 'App.tsx'), CLEAN, 'utf8')
    expect(main(['check', '--json', '--source', srcDir, '--target', 'ios'])).toBe(0)
    const parsed = JSON.parse(logs[0]!) as { targets: string[] }
    expect(parsed.targets, 'the target after --json survived').toEqual(['swift'])
  })

  it('flags may appear in any order', () => {
    // Same platform caveat as above: assert the PARSE outcome (valid JSON
    // carrying the requested target), never the toolchain-dependent code.
    writeFileSync(join(srcDir, 'App.tsx'), CLEAN, 'utf8')
    main(['check', `--source=${srcDir}`, '--json', '--typecheck', '--target=ios'])
    expect(logs, 'json mode still emits exactly one line').toHaveLength(1)
    const parsed = JSON.parse(logs[0]!) as { targets: string[]; filesChecked: number }
    expect(parsed.targets).toEqual(['swift'])
    expect(parsed.filesChecked).toBe(1)
  })
})

describe('build reports a source that cannot be parsed', () => {
  it('returns 2 and names the file when a source has a SYNTAX error', () => {
    // Before parse errors were made fatal this wrote an EMPTY .swift and
    // exited 0, so the failure surfaced much later as a missing symbol in
    // Xcode with nothing pointing back at the file.
    writeFileSync(join(srcDir, 'Broken.tsx'), 'export function C() { return <text>hi</text> ', 'utf8')
    const code = main(['build', '--target=ios', `--source=${srcDir}`, `--out=${out}`])
    expect(code).toBe(2)
    expect(errs.join('\n')).toContain('Broken.tsx')
  })
})
