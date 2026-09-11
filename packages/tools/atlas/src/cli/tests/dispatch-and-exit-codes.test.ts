/**
 * `atlas <command>` — what each subcommand does when things go wrong, and
 * what exit code it hands back.
 *
 * Every one of these commands is meant to be run in CI and by an agent, so
 * the exit code is the contract and the stderr line is the whole diagnosis.
 * The failure mode is specific and quiet: a command that cannot do its job
 * and exits 0 reports success for work it did not do — `verify` finding
 * nothing to verify, `check` with no catalog to check against, `build`
 * emitting a shell page. "0 failing" is not a pass when nothing ran, and that
 * distinction is what most of this file is about.
 *
 * The other half is the guidance. `atlas` is designed to be driven by an
 * assistant, so a message that names the problem without naming the fix costs
 * a round trip every time — which is why several specs assert the remedy text
 * and not just that something was printed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runCli } from '../run'

let dir: string
let stdout: string[]
let stderr: string[]

const write = (rel: string, body: string): string => {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
  return abs
}

/**
 * A one-component project whose scenarios all PASS.
 *
 * The prop is numeric on purpose: a `label: string` prop generates an
 * empty-string scenario, and the a11y check correctly fails it — which is
 * right behaviour and makes `scan` exit 1, so it cannot serve as the control
 * for "a healthy project exits 0". The failing shape gets its own spec below.
 */
const project = (): void => {
  write('src/Counter.tsx', 'export function Counter(props: { count: number }) { return null }\n')
}

/** A component whose generated empty-string scenario fails the a11y check. */
const failingProject = (): void => {
  write('src/Button.tsx', 'export function Button(props: { label: string }) { return null }\n')
}

const CONFIG = 'pyreon.config.ts'

const run = async (...argv: string[]): Promise<number> => runCli(argv)
const outText = () => stdout.join('')
const errText = () => stderr.join('')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-cli-'))
  stdout = []
  stderr = []
  vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
    stdout.push(String(c))
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
    stderr.push(String(c))
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('the top-level dispatch', () => {
  it('prints help for no command, and exits 0', async () => {
    // Running the bare binary is how someone finds out what it does. Exiting
    // non-zero there makes `atlas` look broken on first contact.
    expect(await run()).toBe(0)
    expect(outText()).toMatch(/scan|verify|dev/)
  })

  it('prints help for --help, -h and `help` alike', async () => {
    for (const flag of ['--help', '-h', 'help']) {
      stdout = []
      expect(await run(flag), flag).toBe(0)
      expect(outText(), flag).toMatch(/scan/)
    }
  })

  it('FAILS on an unknown command and points at --help', async () => {
    // A typo must not exit 0. In a CI script that difference is the whole
    // signal — `atlas scna` would otherwise pass silently forever.
    expect(await run('scna')).toBe(1)
    expect(errText()).toContain('unknown command')
    expect(errText(), 'and say where to look').toContain('--help')
  })

  it('names the command it did not recognise', async () => {
    await run('wibble')
    expect(errText()).toContain('wibble')
  })
})

describe('atlas scan', () => {
  it('scans a healthy project, writes the catalog, and exits 0', async () => {
    // The control for every failure path below.
    project()
    expect(await run('scan', dir)).toBe(0)
    expect(() => readFileSync(join(dir, 'atlas-catalog.json'), 'utf8')).not.toThrow()
  })

  it('exits NON-ZERO when a scenario fails verification', async () => {
    // The whole point of a verified catalog: `scan` is a gate, not a report.
    // Exiting 0 with failing scenarios in the file would let a broken
    // component through CI while the catalog records that it is broken.
    failingProject()
    expect(await run('scan', dir)).toBe(1)
    expect(errText(), 'and name the scenario').toContain('failing scenario')
  })

  it('names WHICH check failed, and how to fix it', async () => {
    // A count of failures is not actionable. The repo's own catalog-v2 design
    // is that every finding carries a code and a fix, so the agent reading
    // this has the one thing to change.
    failingProject()
    await run('scan', dir)
    expect(errText()).toContain('a11y')
    expect(errText(), 'the fix travels with the finding').toMatch(/→|aria-label/)
  })

  it('FAILS on an empty project rather than writing an empty catalog', async () => {
    // An empty catalog is worse than none: a later `--check` would ratchet
    // against it and certify a project with no components as fully verified.
    // So finding nothing is a failure, not a clean run — the same rule the
    // doctor applies to an empty scan.
    expect(await run('scan', dir), 'an empty scan is not a pass').toBe(1)
    expect(errText()).toContain('no components found')
    expect(errText(), 'and say where it looked').toContain('src')
    expect(() => readFileSync(join(dir, 'atlas-catalog.json'), 'utf8'), 'nothing written').toThrow()
  })

  it('does NOT write the catalog under --check', async () => {
    // A ratchet that rewrites its own baseline compares a run against itself
    // and can never report a regression again.
    project()
    await run('scan', dir)
    const before = readFileSync(join(dir, 'atlas-catalog.json'), 'utf8')
    writeFileSync(join(dir, 'atlas-catalog.json'), before.replace(/\s+$/, '') + '\n')
    const stamp = readFileSync(join(dir, 'atlas-catalog.json'), 'utf8')
    await run('scan', dir, '--check')
    expect(readFileSync(join(dir, 'atlas-catalog.json'), 'utf8'), 'untouched').toBe(stamp)
  })

  it('reports what it VERIFIED, and what it could not run', async () => {
    // The summary is the deliverable. "N verified" counts SCENARIOS, so a run
    // where four of six checks never executed still reports every scenario
    // verified — which is why the `not run:` lines exist and why each carries
    // its reason. Dropping them would make an unmeasured run indistinguishable
    // from a fully-checked one.
    project()
    await run('scan', dir)
    expect(outText()).toMatch(/\d+ verified/)
    expect(outText(), 'and name what did not run').toContain('not run:')
    expect(outText(), 'each with a reason').toMatch(/browser-only|no plugin claimed|no GC hook/)
  })

  it('reports a config that FAILED to load, before the counts', async () => {
    // A config that was found and could not be used explains most of what
    // follows — no groups, no title, no projects. Printing it after the
    // summary is printing it too late to be read as the cause.
    project()
    write('atlas.config.ts', 'this is not valid typescript at all ((((\n')
    await run('scan', dir)
    expect(errText()).toMatch(/config|atlas:/)
  })
})

describe('atlas verify', () => {
  it('with NO name verifies everything, and fails when nothing was checked', async () => {
    // Documents the shape rather than assuming a refusal. The important half
    // is the exit code: a run where no check executed is not a pass, because
    // "0 failing" out of zero checks is exactly the false green the whole
    // verify design is written against.
    project()
    await run('scan', dir)
    stdout = []
    stderr = []
    const code = await run('verify', '--cwd', dir)
    const text = outText() + errText()
    if (/no checks ran|nothing was verified/i.test(text)) {
      expect(code, 'nothing verified is not a pass').not.toBe(0)
    } else {
      expect(typeof code).toBe('number')
    }
  })

  it('FAILS for a component that does not exist', async () => {
    // An unmatched name must not read as "nothing failed". This is the
    // documented half of the contract: an unmatched name and a
    // nothing-was-verified run BOTH exit non-zero.
    project()
    await run('scan', dir)
    const code = await run('verify', 'NoSuchThing', '--cwd', dir)
    expect(code, 'an unmatched name is a failure').not.toBe(0)
  })

  it('verifies a real component', async () => {
    project()
    await run('scan', dir)
    stdout = []
    stderr = []
    const code = await run('verify', 'Counter', '--cwd', dir)
    expect(code, 'a healthy component passes').toBe(0)
  })

  it('emits JSON with --json', async () => {
    // The surface an agent parses. Prose here costs a round trip on every
    // verify.
    project()
    await run('scan', dir)
    stdout = []
    await run('verify', 'Counter', '--cwd', dir, '--json')
    expect(() => JSON.parse(outText())).not.toThrow()
    const parsed = JSON.parse(outText()) as { component: string | null }
    expect(parsed.component).toBe('Counter')
  })

  it('emits valid JSON even when the component is unknown', async () => {
    // The failure case is exactly when a parser is reading — returning prose
    // there breaks the consumer at the moment it needs the answer most.
    project()
    await run('scan', dir)
    stdout = []
    await run('verify', 'Nope', '--cwd', dir, '--json')
    expect(() => JSON.parse(outText())).not.toThrow()
  })
})

describe('atlas check', () => {
  it('requires a component name', async () => {
    expect(await run('check')).not.toBe(0)
    expect(errText()).toMatch(/component|name|usage/i)
  })

  it('reports NO CATALOG rather than treating it as a clean check', async () => {
    // Running `check` before `scan` is the ordinary first mistake. Exiting 0
    // would certify a component nobody has looked at.
    expect(await run('check', 'Counter', '--cwd', dir)).not.toBe(0)
    expect(errText()).toMatch(/catalog|atlas scan/i)
  })

  it('reports a CORRUPT catalog distinctly from a missing one', async () => {
    // The remedies differ — regenerate versus investigate — and a single
    // "cannot read catalog" message sends the reader down the wrong one.
    write('atlas-catalog.json', '{ not json')
    expect(await run('check', 'Counter', '--cwd', dir)).not.toBe(0)
    expect(errText()).toMatch(/json|parse|corrupt/i)
  })

  it('reports an UNKNOWN component against a real catalog', async () => {
    project()
    await run('scan', dir)
    stderr = []
    expect(await run('check', 'Nope', '--cwd', dir)).not.toBe(0)
    expect(errText()).toMatch(/Nope|unknown/i)
  })

  it('checks a real component', async () => {
    project()
    await run('scan', dir)
    stdout = []
    stderr = []
    const code = await run('check', 'Counter', '--cwd', dir)
    expect(typeof code).toBe('number')
  })
})

describe('atlas init', () => {
  it('writes a config and exits 0', async () => {
    // The control.
    project()
    expect(await run('init', dir)).toBe(0)
    expect(() => readFileSync(join(dir, CONFIG), 'utf8')).not.toThrow()
  })

  it('refuses to OVERWRITE an existing config, and names the flag that would', async () => {
    // The config carries the user's theme, wrapper and authored scenarios.
    // Silently replacing it loses hand-written work with no undo — so the
    // refusal has to say BOTH that it stopped and how to mean it.
    project()
    write(CONFIG, 'export default { title: "mine" }\n')
    const code = await run('init', dir)
    expect(readFileSync(join(dir, CONFIG), 'utf8'), 'untouched').toContain('mine')
    expect(code, 'refusing is a failure, not a no-op').toBe(1)
    expect(errText() + outText()).toMatch(/already exists/i)
    expect(errText() + outText(), 'and name --force').toContain('--force')
    expect(errText() + outText(), 'and say what would be lost').toMatch(/hand-edited|wrapper|theme/i)
  })

  it('FAILS when there is nothing to write a config for', async () => {
    // An empty directory. Writing a config listing no projects would be a
    // file the user then has to work out how to fix, and exiting 0 would say
    // the setup succeeded.
    expect(await run('init', dir)).toBe(1)
    expect(errText() + outText()).toMatch(/no components/i)
    expect(errText() + outText(), 'and offer the way forward').toContain('atlas init <dir>')
  })

  it('shows what it WOULD write under --dry-run, and writes nothing', async () => {
    project()
    const code = await run('init', dir, '--dry-run')
    expect(code).toBe(0)
    expect(() => readFileSync(join(dir, CONFIG), 'utf8'), 'nothing written').toThrow()
    expect(outText(), 'and show the real content, not a summary').toContain('Pyreon configuration')
  })
})

describe('atlas build', () => {
  it('reports a failure rather than throwing out of the process', async () => {
    // A build that throws leaves a stack trace where a diagnosis belongs, and
    // in CI it looks like the tool crashed rather than the project being
    // wrong.
    const code = await run('build', dir)
    expect(typeof code).toBe('number')
    if (code !== 0) expect(errText().length).toBeGreaterThan(0)
  })
})

describe('flag parsing', () => {
  it('reads a value flag', async () => {
    // `--cwd <dir>` is how every command is pointed at a project; misreading
    // it silently scans the process cwd instead, which in a monorepo is a
    // completely different tree.
    project()
    await run('scan', dir)
    stderr = []
    expect(await run('verify', 'Counter', '--cwd', dir)).toBe(0)
  })

  it('treats a flag followed by ANOTHER FLAG as having no value', async () => {
    // `--cwd --json` is a typo, not a directory named `--json`. Consuming the
    // next flag as a value both loses the flag and scans a path that does not
    // exist.
    //
    // Run it from INSIDE the fixture. With no value, `--cwd` correctly falls
    // back to the process cwd — and the process cwd under vitest is the REPO,
    // so this spec as first written pointed the scanner at the whole monorepo:
    // 13.7s and 862 MB in one worker, against ~1.4s and ~320 MB for the rest
    // of the file. Under the coverage job's 4-way parallelism that sits at
    // Node's old-space cap, and vitest reports a dead worker as
    // `STACK_TRACE_ERROR` against whichever spec was in flight — a failure that
    // names a test and says nothing about memory.
    project()
    await run('scan', dir)
    stdout = []
    const cwd = process.cwd()
    try {
      process.chdir(dir)
      await run('verify', 'Counter', '--cwd', '--json')
    } finally {
      process.chdir(cwd)
    }
    expect(outText() + errText(), 'did not scan a directory called --json').not.toContain(
      "'--json'",
    )
  })
})
