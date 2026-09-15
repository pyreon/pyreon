/**
 * The CLI's DEFAULTS, and the two report shapes that only a specific project
 * state produces.
 *
 * Every command takes its directory from a positional argument that may be
 * absent, and every one of them defaults to `'.'`. That default is silent when
 * it is wrong: in a monorepo the process cwd is a completely different tree
 * from the package being worked on, so a command that quietly scanned it would
 * report a catalog nobody asked about — and, under `--check`, ratchet against
 * a baseline from the wrong project.
 *
 * `formatDualInstanceNotice` is separated out for the same reason it exists:
 * the two resolved module LOCATIONS are the actionable half. Without them
 * "align the versions" sends the reader into node_modules archaeology for
 * paths the caught sentinel error already carried — which is exactly what an
 * upstream report described doing, through a manifest revert and a --force
 * reinstall, before finding the second copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { formatDualInstanceNotice, runCli, runScan } from '../run'

let dir: string
let stdout: string[]
let stderr: string[]
let cwdBefore: string

const write = (rel: string, body: string): void => {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

const counter = (): void =>
  write('src/Counter.tsx', 'export function Counter(props: { count: number }) { return null }\n')

const outText = () => stdout.join('')
const errText = () => stderr.join('')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-covdef-'))
  cwdBefore = process.cwd()
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
  process.chdir(cwdBefore)
  vi.restoreAllMocks()
  vi.resetModules()
  rmSync(dir, { recursive: true, force: true })
})

/**
 * Run from INSIDE the fixture, so the `'.'` default resolves to a project
 * rather than to this repository.
 *
 * Pointing the scanner at the whole monorepo is not merely slow: it is 862 MB
 * in one worker, which under the coverage job's parallelism sits at Node's
 * old-space cap — and vitest reports a dead worker as `STACK_TRACE_ERROR`
 * against whichever spec was in flight, a failure that names a test and says
 * nothing about memory.
 */
const inFixture = async <T,>(fn: () => Promise<T>): Promise<T> => {
  process.chdir(dir)
  try {
    return await fn()
  } finally {
    process.chdir(cwdBefore)
  }
}

describe('every command defaults its directory to the process cwd', () => {
  it('scan, with no positional, scans HERE and writes here', async () => {
    counter()
    const code = await inFixture(() => runCli(['scan', '--no-mount']))
    expect(code).toBe(0)
    expect(() => readFileSync(join(dir, 'atlas-catalog.json'), 'utf8')).not.toThrow()
  })

  it('scan --check, with no positional, reads the baseline from HERE', async () => {
    // The ratchet's baseline is `atlas-catalog.json` next to the project. A
    // default applied to the scan and not to the baseline lookup compares two
    // different catalogs and reports movement that never happened.
    counter()
    await inFixture(() => runCli(['scan', '--no-mount']))
    stdout = []
    stderr = []
    const code = await inFixture(() => runCli(['scan', '--check', '--no-mount']))
    expect(code).toBe(0)
    expect(outText() + errText(), 'it found the baseline').not.toContain('nothing to compare')
    expect(outText()).toContain('--check:')
  })

  it('scan with an empty cwd names `./src` in the not-found message', async () => {
    // The message has to name where it LOOKED, and `.` is a real answer.
    mkdirSync(join(dir, 'empty'), { recursive: true })
    process.chdir(join(dir, 'empty'))
    const code = await runCli(['scan'])
    process.chdir(cwdBefore)
    expect(code).toBe(1)
    expect(errText()).toContain(join('.', 'src'))
  })

  it('verify defaults --cwd to the process directory', async () => {
    counter()
    await inFixture(() => runCli(['scan', '--no-mount']))
    stdout = []
    const code = await inFixture(() => runCli(['verify', 'Counter', '--json']))
    expect(code).toBe(0)
    expect((JSON.parse(outText()) as { component: string }).component).toBe('Counter')
  })

  it('check defaults --cwd to the process directory', async () => {
    counter()
    await inFixture(() => runCli(['scan', '--no-mount']))
    stdout = []
    expect(await inFixture(() => runCli(['check', 'Counter', '{"count":2}']))).toBe(0)
  })

  it('init, with no positional, writes the config HERE', async () => {
    // The zero-argument `atlas init`. Writing into the process cwd is the
    // whole point; defaulting anywhere else configures a different project.
    counter()
    write('package.json', JSON.stringify({ name: 'here' }))
    const code = await inFixture(() => runCli(['init']))
    expect(code).toBe(0)
    expect(() => readFileSync(join(dir, 'pyreon.config.ts'), 'utf8')).not.toThrow()
  })

  it('runScan itself defaults `cwd`, so a library caller need not pass one', async () => {
    counter()
    const result = await inFixture(() => runScan({ write: false, mount: false }))
    expect(result.components).toBe(1)
  })
})

describe('verify --check exits NON-ZERO on a regression', () => {
  it('returns the ratchet\'s code before reporting the absolute verdict', async () => {
    // "Did I help" leads, and a regression has to STOP the command — a
    // ratchet that reports a regression and exits 0 gates nothing.
    counter()
    await inFixture(() => runCli(['scan']))

    // Break the component so its mount check starts failing. The catalog on
    // disk still records the passing verdict, so this is a real regression.
    write('src/Counter.tsx', 'export function Counter(props: { count: number }) { throw new Error("broken") }\n')
    stdout = []
    stderr = []
    const code = await inFixture(() => runCli(['verify', 'Counter', '--check']))

    expect(code, 'a regression is a red exit').toBe(1)
    expect(outText() + errText()).toContain('REGRESSED')
  })
})

describe('formatDualInstanceNotice', () => {
  it('NAMES the two resolved copies when the sentinel carried them', () => {
    // Without the locations, "align the versions" is an instruction with no
    // starting point.
    const notice = formatDualInstanceNotice('A: /app/node_modules/@pyreon/core (0.51.0)\nB: /atlas/node_modules/@pyreon/core (0.50.0)')
    expect(notice).toContain('The two copies:')
    expect(notice).toContain('/app/node_modules/@pyreon/core')
    expect(notice).toContain('/atlas/node_modules/@pyreon/core')
    expect(notice, 'indented under its heading').toMatch(/\n {4}A: /)
  })

  it('stands alone when the sentinel carried no detail', () => {
    // An older framework build, or a failure that was not the sentinel's. The
    // summary still has to explain why every scenario reads unverified.
    const notice = formatDualInstanceNotice(undefined)
    expect(notice).not.toContain('The two copies:')
    expect(notice, 'the refusal is still explained').toContain('DIFFERENT copies')
    expect(notice, 'and why declining beats mounting anyway').toContain('rather than about your components')
    expect(notice, 'and the remedy').toContain('Align the versions')
  })
})

describe('a project whose own vite config cannot be read', () => {
  it('surfaces the alias WARNING rather than failing the scan', async () => {
    // A component importing `~/components/…` does not load, which drops it
    // from the catalog silently — and in `atlas dev` puts an overlay over the
    // whole workbench. Naming the unreadable config is the difference between
    // a five-second fix and an afternoon.
    counter()
    write('vite.config.ts', 'this is not valid typescript at all ((((\n')
    const result = await runScan({ cwd: dir, write: false, mount: false })
    expect(result.aliasWarning, 'the warning reached the result').toBeTruthy()
    expect(result.aliasWarning).toContain('atlas.config.ts')
  })
})

describe('the config\'s wrapper, presets and authored scenarios reach the scan', () => {
  it('reports the config PATH only when the config actually exports a wrapper', async () => {
    // `configPath` is what `atlas dev` and `atlas build` re-load to get the
    // wrapper. Setting it for a config that has none would make them import a
    // module for nothing.
    counter()
    write('atlas.config.ts', 'export default { title: "No Wrapper" }\n')
    const without = await runScan({ cwd: dir, write: false, mount: false })
    expect(without.configPath, 'no wrapper, no path').toBeUndefined()
    expect(without.configFound, 'but the file was still found').toBeTruthy()
  })

  it('carries `presets` through for the workbench addons', async () => {
    counter()
    write(
      'atlas.config.ts',
      'export default { presets: { viewports: [{ id: "phone", label: "Phone", width: 390, height: 844 }] } }\n',
    )
    const result = await runScan({ cwd: dir, write: false, mount: false })
    expect(result.presets?.viewports?.[0]?.id).toBe('phone')
  })

  it('an AUTHORED scenario wins over the generated one with the same id', async () => {
    // The generators dedup by id and the authored plugin runs BEFORE them, so
    // an author's named state replaces the derived one rather than sitting
    // beside a duplicate.
    counter()
    write(
      'atlas.config.ts',
      'export default { scenarios: { Counter: [{ name: "Loaded", args: { count: 9 } }] } }\n',
    )
    const result = await runScan({ cwd: dir, write: false, mount: false })
    const names = result.graph.get('Counter')?.scenarios.map((s) => s.name) ?? []
    expect(names, 'the authored one is present, and first').toContain('Loaded')
    expect(names[0]).toBe('Loaded')
  })
})

describe('a non-Error throw out of a lazily-imported command', () => {
  it('is still reported as a line, not as `undefined`', async () => {
    // `String((error as Error)?.message ?? error)`: a bare `throw 'x'` has no
    // `.message`, and printing `undefined` would lose the only thing said.
    vi.doMock('../../build/static', () => ({
      buildStatic: async () => {
        throw 'vite exploded'
      },
    }))
    const { runCli: fresh } = await import('../run')
    expect(await fresh(['build', dir])).toBe(1)
    expect(errText()).toContain('vite exploded')
  })

  it('reports a dev-server throw with no message the same way', async () => {
    vi.doMock('../../dev/server', () => ({
      startDevServer: async () => {
        throw { code: 'EADDRINUSE' }
      },
    }))
    const { runCli: fresh } = await import('../run')
    expect(await fresh(['dev', dir])).toBe(1)
    expect(errText().length, 'something was said').toBeGreaterThan(0)
  })
})

describe('a config that exports a real WRAPPER', () => {
  it('reports the config path, which is what dev and build re-load', async () => {
    // `configPath` is set only when the config actually exports a wrapper,
    // because it is a re-import instruction: `atlas dev` and `atlas build`
    // load that module to get the providers every scenario renders inside.
    // Setting it for a config that has none would make them import a module
    // for nothing; leaving it unset when there IS one renders the whole
    // workbench unwrapped, which looks like a broken theme.
    counter()
    write(
      'atlas.config.ts',
      'export default { wrapper: (props) => props.children, title: "Wrapped" }\n',
    )
    const result = await runScan({ cwd: dir, write: false })
    expect(result.configPath, 'the wrapper is there, so the path is reported').toContain(
      'atlas.config.ts',
    )
    expect(result.title, 'and the rest of the config still applies').toBe('Wrapped')
  })
})

describe('the lazily-imported commands default their directory too', () => {
  const cwdOf = async (
    module: string,
    exportName: string,
    argv: string[],
  ): Promise<unknown> => {
    let seen: Record<string, unknown> = {}
    vi.doMock(module, () => ({
      [exportName]: async (options: Record<string, unknown>) => {
        seen = options
        throw new Error('stop — the point is the options, not the work')
      },
    }))
    const { runCli: fresh } = await import('../run')
    await fresh(argv)
    return seen['cwd']
  }

  it('verify-browser with no positional runs HERE', async () => {
    expect(await cwdOf('../../verify-browser/runner', 'runBrowserVerify', ['verify-browser'])).toBe(
      '.',
    )
  })

  it('dev with no positional runs HERE', async () => {
    expect(await cwdOf('../../dev/server', 'startDevServer', ['dev'])).toBe('.')
  })

  it('build with no positional runs HERE', async () => {
    expect(await cwdOf('../../build/static', 'buildStatic', ['build'])).toBe('.')
  })

  it('and each still honours an explicit positional', async () => {
    expect(await cwdOf('../../build/static', 'buildStatic', ['build', dir])).toBe(dir)
  })
})
