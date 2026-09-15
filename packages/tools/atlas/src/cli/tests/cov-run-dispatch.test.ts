/**
 * The command layer of `runCli` — the arms between parsing an argv and handing
 * back an exit code.
 *
 * Three commands (`dev`, `build`, `verify-browser`) reach their work through a
 * LAZY import, deliberately: those paths pull in Vite or Playwright, and
 * `atlas scan` must keep working — and starting fast — in a project that has
 * neither. That lazy seam is also what makes their CLI behaviour testable
 * without booting a server: the specs below replace the imported module, so
 * what is under test is the argument handling, the reporting and the exit code
 * — which is the whole of what this layer owns.
 *
 * `atlas dev`'s SUCCESS path is deliberately not driven here. It ends in
 * `await new Promise(() => {})` — the server owns the process until it is
 * interrupted — so a spec that reached it would hang rather than assert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

let dir: string
let stdout: string[]
let stderr: string[]

const write = (rel: string, body: string): void => {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

const counter = (): void =>
  write('src/Counter.tsx', 'export function Counter(props: { count: number }) { return null }\n')

/**
 * A component the STATIC scan sees and the loader cannot import.
 *
 * Its types are readable, so discovery produces the component and its
 * scenarios; the module's top-level import does not resolve, so nothing can
 * mount it and every runtime check skips. That is the shape where "0 failing"
 * and "everything passed" are the same counts.
 */
const unloadable = (): void =>
  write(
    'src/Broken.tsx',
    "import '@no/such/package'\nexport function Broken(props: { count: number }) { return null }\n",
  )

const outText = () => stdout.join('')
const errText = () => stderr.join('')

/** `runCli` from a fresh module graph, so a `vi.doMock` below is in effect. */
const load = async () => (await import('../run')).runCli

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-covdisp-'))
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
  vi.resetModules()
  rmSync(dir, { recursive: true, force: true })
})

describe('atlas verify — the ratchet and the nothing-verified refusal', () => {
  it('runs the --check comparison scoped to the SAME component', async () => {
    // "Did I help" is the question a reader running --check is asking, so the
    // answer leads — before the absolute verdict below it.
    const runCli = await load()
    counter()
    await runCli(['scan', dir, '--no-mount'])
    stdout = []
    stderr = []

    const code = await runCli(['verify', 'Counter', '--cwd', dir, '--check', '--no-mount'])
    expect(outText() + errText()).toContain('--check:')
    expect(typeof code).toBe('number')
  })

  it('reads --cwd for the ratchet baseline too, not just for the scan', async () => {
    // The baseline lives next to the project, not next to the process. Reading
    // one from the cwd and the other from `--cwd` compares two different
    // catalogs and reports movement that never happened.
    const runCli = await load()
    counter()
    await runCli(['scan', dir, '--no-mount'])
    stdout = []
    stderr = []
    await runCli(['verify', 'Counter', '--cwd', dir, '--check', '--no-mount'])
    expect(outText() + errText(), 'it found the baseline').not.toContain('nothing to compare')
  })

  it('does NOT print the ratchet under --json, which would corrupt the payload', async () => {
    // The surface an agent parses. A human-readable diff interleaved into the
    // stream breaks the consumer at the moment it needs the answer.
    const runCli = await load()
    counter()
    await runCli(['scan', dir, '--no-mount'])
    stdout = []
    await runCli(['verify', 'Counter', '--cwd', dir, '--json', '--check'])
    expect(() => JSON.parse(outText()), 'still one parseable document').not.toThrow()
  })

  it('FAILS when nothing could be verified, even with zero failures', async () => {
    // The false green this whole verify design is written against. The static
    // scan finds the component — its TYPES are readable — but the module
    // cannot be imported, so nothing can mount it and every check skips. The
    // counts for that and for "everything passed" are identical, and the
    // wrong one is green.
    const runCli = await load()
    unloadable()
    const code = await runCli(['verify', 'Broken', '--cwd', dir])
    expect(code, 'nothing verified is not a pass').toBe(1)
    expect(errText()).toContain('nothing was verified')
    expect(errText(), 'and say it is not a pass').toContain('not a pass')
    expect(errText(), 'and point at the reasons above').toContain('see the reasons above')
  })

  it('reports the nothing-verified refusal through the JSON payload, not as prose', async () => {
    // Same finding, machine-readable. Printing the prose line into a --json
    // run would break the parser on the exact case it most needs to read.
    const runCli = await load()
    unloadable()
    stdout = []
    stderr = []
    const code = await runCli(['verify', 'Broken', '--cwd', dir, '--json'])
    expect(code).toBe(1)
    expect(errText(), 'no prose alongside the payload').not.toContain('nothing was verified')
    const parsed = JSON.parse(outText()) as { ok: boolean; verified: number }
    expect(parsed.ok, 'and the payload says so').toBe(false)
    expect(parsed.verified).toBe(0)
  })

  it('reports `component: null` for a whole-catalog verify', async () => {
    // The field is how an agent tells a scoped run from a full one. Omitting
    // it, or writing the string "undefined", both break that branch.
    const runCli = await load()
    counter()
    stdout = []
    await runCli(['verify', '--cwd', dir, '--json', '--no-mount'])
    const parsed = JSON.parse(outText()) as { component: string | null }
    expect(parsed.component).toBeNull()
  })
})

describe('atlas verify — a name that matched by something other than an exact hit', () => {
  it('carries the match NOTE on the JSON payload', async () => {
    // A case-insensitive hit is a match, not a miss — but the reader has to
    // know it was not exact, or a genuine typo looks like a working command.
    const runCli = await load()
    counter()
    stdout = []
    await runCli(['verify', 'counter', '--cwd', dir, '--json', '--no-mount'])
    const parsed = JSON.parse(outText()) as { note?: string }
    expect(parsed.note).toContain('case-insensitive')
  })

  it('prints the match NOTE to stderr in the human report', async () => {
    const runCli = await load()
    counter()
    stdout = []
    stderr = []
    await runCli(['verify', 'COUNTER', '--cwd', dir, '--no-mount'])
    expect(errText()).toContain('case-insensitive')
  })
})

describe('atlas verify-browser', () => {
  const mockRunner = (impl: () => unknown): void => {
    vi.doMock('../../verify-browser/runner', () => ({
      runBrowserVerify: async () => impl(),
    }))
  }

  it('reports the summary and exits 0 when no snapshot differed', async () => {
    mockRunner(() => ({
      scenarios: 4,
      coverageMeasured: 3,
      snapshotsCreated: 2,
      snapshotsFailed: 0,
      notDriven: [],
      catalogPath: '/tmp/atlas-catalog.json',
    }))
    const runCli = await load()
    const code = await runCli(['verify-browser', dir])
    expect(code).toBe(0)
    expect(outText()).toContain('4 scenario(s)')
    expect(outText()).toContain('2 baseline(s) created')
    expect(outText(), 'and where the verdicts were merged').toContain('atlas-catalog.json')
  })

  it('exits NON-ZERO on a visual diff — a pixel regression is a failure', async () => {
    mockRunner(() => ({
      scenarios: 1,
      coverageMeasured: 1,
      snapshotsCreated: 0,
      snapshotsFailed: 1,
      notDriven: [],
    }))
    const runCli = await load()
    expect(await runCli(['verify-browser', dir])).toBe(1)
  })

  it('NAMES the scenarios it could not drive, rather than counting them silently', async () => {
    // A workbench-host component keeps a `skip` browser verdict. Without the
    // names, a reader cannot tell a deliberate skip from a broken run.
    mockRunner(() => ({
      scenarios: 2,
      coverageMeasured: 1,
      snapshotsCreated: 0,
      snapshotsFailed: 0,
      notDriven: ['Workbench--default'],
    }))
    const runCli = await load()
    expect(await runCli(['verify-browser', dir])).toBe(0)
    expect(outText()).toContain('Workbench--default')
    expect(outText()).toContain('not drivable')
  })

  it('passes --update-snapshots through as a re-baseline request', async () => {
    let seen: unknown
    vi.doMock('../../verify-browser/runner', () => ({
      runBrowserVerify: async (options: unknown) => {
        seen = options
        return { scenarios: 0, coverageMeasured: 0, snapshotsCreated: 0, snapshotsFailed: 0, notDriven: [] }
      },
    }))
    const runCli = await load()
    await runCli(['verify-browser', dir, '--update-snapshots'])
    expect(seen).toMatchObject({ updateSnapshots: true })
  })

  it('OMITS the flag when it was not passed, rather than sending false', async () => {
    // `exactOptionalPropertyTypes`: an explicit `undefined` is not the same as
    // an absent key, and a `false` would overwrite a caller default.
    let seen: Record<string, unknown> = {}
    vi.doMock('../../verify-browser/runner', () => ({
      runBrowserVerify: async (options: Record<string, unknown>) => {
        seen = options
        return { scenarios: 0, coverageMeasured: 0, snapshotsCreated: 0, snapshotsFailed: 0, notDriven: [] }
      },
    }))
    const runCli = await load()
    await runCli(['verify-browser', dir])
    expect(Object.hasOwn(seen, 'updateSnapshots')).toBe(false)
  })

  it('reports a THROW as a diagnosis and exit 1, not as a stack trace', async () => {
    // In CI a stack trace reads as "the tool crashed" rather than "your
    // project needs playwright-core".
    mockRunner(() => {
      throw new Error('playwright-core is not installed')
    })
    const runCli = await load()
    expect(await runCli(['verify-browser', dir])).toBe(1)
    expect(errText()).toContain('playwright-core is not installed')
  })

  it('survives a non-Error throw', async () => {
    mockRunner(() => {
      throw 'a bare string'
    })
    const runCli = await load()
    expect(await runCli(['verify-browser', dir])).toBe(1)
    expect(errText()).toContain('a bare string')
  })
})

describe('atlas dev — the arguments, and the failure path', () => {
  it('reads --port in BOTH forms and hands it to the server', async () => {
    // This once read only `--port=5199`, so `--port 5199` — the form people
    // type, and the one `--out` and `--title` accept — was silently ignored
    // and the server came up on the default port. A flag that is quietly
    // dropped is worse than one that is rejected.
    const seen: unknown[] = []
    vi.doMock('../../dev/server', () => ({
      startDevServer: async (options: unknown) => {
        seen.push(options)
        throw new Error('stop here — the success path never returns')
      },
    }))
    const runCli = await load()
    await runCli(['dev', dir, '--port', '5199'])
    await runCli(['dev', dir, '--port=5200'])
    expect(seen).toEqual([
      { cwd: dir, port: 5199 },
      { cwd: dir, port: 5200 },
    ])
  })

  it('OMITS `port` entirely when the flag is absent', async () => {
    // Sending `undefined` would override the server's own default.
    let seen: Record<string, unknown> = {}
    vi.doMock('../../dev/server', () => ({
      startDevServer: async (options: Record<string, unknown>) => {
        seen = options
        throw new Error('stop')
      },
    }))
    const runCli = await load()
    await runCli(['dev', dir])
    expect(Object.hasOwn(seen, 'port')).toBe(false)
    expect(seen['cwd'], 'and the positional dir still arrives').toBe(dir)
  })

  it('reports a boot failure as a diagnosis and exit 1', async () => {
    vi.doMock('../../dev/server', () => ({
      startDevServer: async () => {
        throw new Error('port 5210 is already in use')
      },
    }))
    const runCli = await load()
    expect(await runCli(['dev', dir])).toBe(1)
    expect(errText()).toContain('already in use')
  })
})

describe('atlas build', () => {
  const mockBuild = (impl: (options: Record<string, unknown>) => unknown): void => {
    vi.doMock('../../build/static', () => ({
      buildStatic: async (options: Record<string, unknown>) => impl(options),
    }))
  }

  it('reports the component count, the output directory and the title', async () => {
    mockBuild(() => ({ components: 7, outDir: '/out/atlas-dist', title: 'Design System', warnings: [] }))
    const runCli = await load()
    expect(await runCli(['build', dir])).toBe(0)
    expect(outText()).toContain('7 component(s)')
    expect(outText()).toContain('/out/atlas-dist')
    expect(outText()).toContain('Design System')
  })

  it('forwards --out, --title and --base, and omits the ones not passed', async () => {
    // `--base` is what makes a subdirectory deploy (GitHub Pages) resolve its
    // assets. Dropping it produces a site that loads nothing, with a build
    // that reported success.
    let seen: Record<string, unknown> = {}
    mockBuild((options) => {
      seen = options
      return { components: 1, outDir: 'x', title: 't', warnings: [] }
    })
    const runCli = await load()
    await runCli(['build', dir, '--out', 'docs', '--base=/repo/'])
    expect(seen).toMatchObject({ cwd: dir, out: 'docs', base: '/repo/' })
    expect(Object.hasOwn(seen, 'title'), 'not passed, so not sent').toBe(false)
  })

  it('does not take a flag VALUE as the directory to build', async () => {
    // `atlas build --out dist/atlas` once scanned its own output directory and
    // reported `no components found under dist/atlas/src` — for a completely
    // ordinary invocation, with nothing pointing at the real cause.
    let seen: Record<string, unknown> = {}
    mockBuild((options) => {
      seen = options
      return { components: 1, outDir: 'x', title: 't', warnings: [] }
    })
    const runCli = await load()
    await runCli(['build', '--out', 'dist/atlas'])
    expect(seen['cwd'], 'the default, not the --out value').toBe('.')
  })

  it('NAMES the panel answers it could not bake', async () => {
    // A site missing one component's Lens is fine; a site missing all of them
    // means the compiler is not installed, and the difference is only visible
    // if the count is reported.
    mockBuild(() => ({
      components: 2,
      outDir: 'x',
      title: 't',
      warnings: ['Button: no compiler', 'Card: no compiler'],
    }))
    const runCli = await load()
    expect(await runCli(['build', dir]), 'a warning is not a failed build').toBe(0)
    expect(errText()).toContain('2 panel answer(s) could not be baked')
    expect(errText()).toContain('report themselves unavailable')
  })

  it('routes the build\'s own log lines to stderr', async () => {
    // Progress belongs on stderr so the summary on stdout stays pipeable.
    mockBuild((options) => {
      ;(options['onLog'] as (m: string) => void)('baking Button')
      return { components: 1, outDir: 'x', title: 't', warnings: [] }
    })
    const runCli = await load()
    await runCli(['build', dir])
    expect(errText()).toContain('baking Button')
    expect(outText()).not.toContain('baking Button')
  })

  it('reports a THROW as a diagnosis and exit 1', async () => {
    mockBuild(() => {
      throw new Error('vite is not installed')
    })
    const runCli = await load()
    expect(await runCli(['build', dir])).toBe(1)
    expect(errText()).toContain('vite is not installed')
  })
})

describe('atlas init — the written summary', () => {
  it('lists each detected project, so the list is auditable at a glance', async () => {
    const runCli = await load()
    write('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] }))
    write('packages/core/package.json', JSON.stringify({ name: '@acme/core' }))
    write('packages/core/src/Button.tsx', 'export function Button(p: { n: number }) { return null }\n')

    expect(await runCli(['init', dir])).toBe(0)
    expect(outText()).toContain('atlas init: wrote')
    expect(outText(), 'each project on its own line').toMatch(/·\s+Core\s+→/)
  })

  it('says a single package needs no `projects`, rather than printing an empty list', async () => {
    const runCli = await load()
    counter()
    expect(await runCli(['init', dir])).toBe(0)
    expect(outText()).toContain('single package')
  })

  it('an explicit --title reaches the written config', async () => {
    const runCli = await load()
    counter()
    expect(await runCli(['init', dir, '--title', 'My Kit'])).toBe(0)
    expect(outText()).toContain('title: My Kit')
  })
})

describe('atlas check — the exit code is the contract', () => {
  it('exits NON-ZERO on a finding, so a hook or a CI step can gate on it', async () => {
    // "It printed a problem" has to mean "it failed", or wiring `atlas check`
    // into a pre-commit hook gates nothing.
    const runCli = await load()
    counter()
    await runCli(['scan', dir, '--no-mount'])
    stdout = []
    const code = await runCli(['check', 'Counter', '{"nope":1}', '--cwd', dir])
    expect(code).toBe(1)
    expect(outText(), 'and print the finding on stdout').toContain('not a prop')
  })

  it('exits 0 for a usage that is valid', async () => {
    const runCli = await load()
    counter()
    await runCli(['scan', dir, '--no-mount'])
    stdout = []
    expect(await runCli(['check', 'Counter', '{"count":1}', '--cwd', dir])).toBe(0)
    expect(outText()).toContain('usage is valid')
  })

  it('reports an unparseable args payload rather than checking against nothing', async () => {
    const runCli = await load()
    counter()
    await runCli(['scan', dir, '--no-mount'])
    stderr = []
    expect(await runCli(['check', 'Counter', '{oops', '--cwd', dir])).toBe(1)
    expect(errText()).toContain('could not parse the args')
  })
})
