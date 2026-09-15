/**
 * `runScan` and `atlas scan` — the arms a project's own CONFIG reaches, and the
 * three different reasons auto-detection fires.
 *
 * Every one of these is a case where the scan produced something and the only
 * question is whether it explained itself. A config that set `ignore` and was
 * ignored, a `title` that never reached the built site, an auto-detected
 * project list with no note saying where it came from — each looks like a
 * working scan and is missing the half that tells a reader what happened.
 *
 * The auto-detection lead is the sharpest of them. THREE states reach it and
 * "no atlas.config.ts" is true of exactly one: it used to be printed for all
 * three, so a project whose config had just FAILED was told it had no config —
 * contradicting the error one line above — and sent off to write a file it had
 * already written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runCli, runScan } from '../run'

let dir: string
let stdout: string[]
let stderr: string[]

const write = (rel: string, body: string): void => {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

/** A component whose generated scenarios all pass — the control for every spec. */
const counter = (at = 'src/Counter.tsx'): void =>
  write(at, 'export function Counter(props: { count: number }) { return null }\n')

const run = async (...argv: string[]): Promise<number> => runCli(argv)
const errText = () => stderr.join('')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-covscan-'))
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

describe('the project config reaches the scan', () => {
  it('carries `title` and `pages` through to the result', async () => {
    // These are what the workbench and the built site read. A config that
    // loads and whose presentation fields are dropped produces a site titled
    // after the directory, with none of the authored grouping — and nothing
    // says the config was read at all.
    counter()
    write(
      'atlas.config.ts',
      'export default { title: "Design System", pages: { Counter: { group: "Data" } } }\n',
    )
    const result = await runScan({ cwd: dir, write: false })
    expect(result.title).toBe('Design System')
    expect(result.pages?.Counter?.group).toBe('Data')
    expect(result.configFound, 'and the path it came from').toContain('atlas.config.ts')
  })

  it('ADDS `ignore` to the defaults rather than replacing them', async () => {
    // A project that wants to skip its generated output must not have to
    // restate `node_modules` to keep it skipped. Replacing the defaults would
    // walk the whole dependency tree on the next scan.
    counter()
    counter('src/generated/Gen.tsx')
    write('atlas.config.ts', 'export default { ignore: ["generated"] }\n')

    const result = await runScan({ cwd: dir, write: false })
    const names = result.graph.list().map((c) => c.name)
    expect(names, 'the ignored directory is gone').toEqual(['Counter'])
    // The ignore set has to reach the UNMATCHED pass too, or a deliberately
    // skipped file is reported as a discovery gap.
    expect(result.unmatched ?? [], 'and is not reported as unmatched').toEqual([])
  })

  it('still reads the config under --no-mount', async () => {
    // `title`, `pages`, `projects` and authored scenarios are meaningful with
    // or without mounting. Gating the whole config on the module loader
    // silently discarded all four, so a monorepo scan found nothing and
    // reported it as a project with no components.
    counter()
    write('atlas.config.ts', 'export default { title: "Static" }\n')
    const result = await runScan({ cwd: dir, write: false, mount: false })
    expect(result.title).toBe('Static')
    expect(result.components).toBe(1)
  })
})

describe('--no-mount — a purely static scan', () => {
  it('still discovers and still writes, with the runtime checks unrun', async () => {
    // Importing a project's modules RUNS its top-level code, which is a
    // decision the user owns. The flag has to actually change what happens,
    // and the catalog must still be produced.
    counter()
    expect(await run('scan', dir, '--no-mount')).toBe(0)
    const catalog = JSON.parse(readFileSync(join(dir, 'atlas-catalog.json'), 'utf8')) as {
      components: { scenarios: { verify?: { interaction?: { status: string } } }[] }[]
    }
    const statuses = catalog.components.flatMap((c) =>
      c.scenarios.map((s) => s.verify?.interaction?.status),
    )
    expect(statuses.every((s) => s === 'skip'), 'nothing was mounted, so nothing is claimed').toBe(
      true,
    )
  })
})

describe('auto-detection says WHY it fired', () => {
  const monorepo = (): void => {
    // Nothing at the root, two packages underneath — the shape that makes
    // auto-detection the only way the scan finds anything.
    write('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] }))
    write('packages/core/package.json', JSON.stringify({ name: '@acme/core' }))
    write('packages/core/src/Button.tsx', 'export function Button(p: { n: number }) { return null }\n')
  }

  it('says "no atlas.config.ts", and points at `atlas init`', async () => {
    monorepo()
    await run('scan', dir, '--no-mount')
    expect(errText()).toContain('no atlas.config.ts')
    expect(errText(), 'and name the detected packages').toContain('Core')
    expect(errText(), 'and the command that writes the list down').toContain('atlas init')
  })

  it('says the config sets no `projects` when one loaded FINE', async () => {
    // A different reader with a different next move: the file exists, so
    // "no atlas.config.ts" would contradict what they can see on disk.
    monorepo()
    write('atlas.config.ts', 'export default { title: "Mine" }\n')
    await run('scan', dir, '--no-mount')
    expect(errText()).toContain('sets no `projects`')
    expect(errText()).not.toContain('no atlas.config.ts')
    expect(errText()).toContain('atlas init')
  })

  it('blames the FAILED config, and says to fix it rather than to write one', async () => {
    // The state that used to contradict itself: an error one line above,
    // followed by "no atlas.config.ts" and an instruction to create the file
    // the reader had just written.
    monorepo()
    write('atlas.config.ts', 'this is not valid typescript at all ((((\n')
    await run('scan', dir)
    expect(errText(), 'the load error leads').toMatch(/atlas: .*config|could not load/i)
    expect(errText()).toContain('did not load')
    expect(errText(), 'the fix is the config, not `atlas init`').toContain('Fix the config')
    expect(errText()).not.toContain('Run `atlas init`')
  })

  it('does NOT fire when the root itself has components', async () => {
    // Auto-detection fills a gap. Firing when there is no gap would print a
    // surprising note on every ordinary single-package scan.
    counter()
    write('packages/core/package.json', JSON.stringify({ name: '@acme/core' }))
    await run('scan', dir, '--no-mount')
    expect(errText()).not.toContain('detected')
  })
})

describe('what the scan LOOKED at and could not catalogue', () => {
  it('reports unmatched files, so a discovery gap is not just a small number', async () => {
    // Without this the only evidence of a gap is a component count that is
    // quietly too low.
    counter()
    write('src/helpers.ts', 'export const NOT_A_COMPONENT = 1\n')
    write('src/Chained.tsx', 'export const Chained = styled.div`color: red`\n')

    await run('scan', dir, '--no-mount')
    const text = errText()
    expect(text, 'the file that produced nothing is named').toMatch(/Chained|helpers/)
  })
})

describe('the --check ratchet against an unreadable baseline', () => {
  it('SKIPS the comparison for a file that parses but is not a catalog', async () => {
    // Valid JSON, wrong shape — a half-written file, or something else
    // entirely at that path. Nothing to compare is not a regression, and
    // making the first --check red for everybody is how a ratchet gets
    // disabled on day one.
    counter()
    writeFileSync(join(dir, 'atlas-catalog.json'), JSON.stringify({ hello: 'world' }))
    const code = await run('scan', dir, '--check', '--no-mount')
    expect(code, 'not a regression').toBe(0)
    expect(errText()).toContain('not a readable catalog')
    expect(errText()).toContain('skipping the comparison')
  })

  it('SKIPS with a different message when there is no baseline file at all', async () => {
    // Distinct remedy: run a scan and commit the result.
    counter()
    const code = await run('scan', dir, '--check', '--no-mount')
    expect(code).toBe(0)
    expect(errText()).toContain('nothing to compare against')
    expect(errText()).toContain('atlas scan')
  })
})

describe('scan names the directory it searched', () => {
  it('quotes the POSITIONAL dir in the empty-project message, not the cwd', async () => {
    // `no components found under src` for a run that searched
    // `packages/ui/src` sends the reader to look in the wrong place.
    mkdirSync(join(dir, 'ui'), { recursive: true })
    const code = await run('scan', join(dir, 'ui'))
    expect(code).toBe(1)
    expect(errText()).toContain(join(dir, 'ui', 'src'))
  })
})

describe('files the rocketstyle pass could not LOAD', () => {
  it('reports the broken import BEFORE the unmatched list', async () => {
    // A file that threw appears in the unmatched list too — as "a
    // chained/member call … needs `theme`" — and that reading sends the
    // reader to their config when the real cause is an import that does not
    // resolve. The load error is the actionable one, so it leads.
    //
    // The pass runs only while a module loader exists, which is why this
    // spec MOUNTS: `--no-mount` is a purely static scan and never imports
    // anything, so there is nothing that can fail to load.
    counter()
    write(
      'src/Styled.tsx',
      "import { el } from '@no/such/design-system'\nexport const Styled = el.attrs({}).theme(() => ({}))\n",
    )

    const result = await runScan({ cwd: dir, write: false })
    expect(result.loadErrors, 'the failure was collected, not logged per file').toBeTruthy()
    expect(result.loadErrors!.some((e) => e.file.includes('Styled'))).toBe(true)

    stderr = []
    const code = await run('scan', dir)
    expect(typeof code).toBe('number')
    const text = errText()
    expect(text, 'the broken import is named').toMatch(/Styled|@no\/such/)
  })

  it('leads with the TOTAL, and gives one exemplar per distinct cause', async () => {
    // One broken import upstream makes every file in a package throw. The
    // report's shape is a count plus an example — "3× <cause>" — rather than
    // a line per file, because 67 identical lines is noise where one line
    // naming the cause is a finding.
    counter()
    for (const n of ['A', 'B', 'C']) {
      write(
        `src/styled/${n}.tsx`,
        `import { el } from '@no/such/design-system'\nexport const ${n} = el.attrs({}).theme(() => ({}))\n`,
      )
    }
    stderr = []
    await run('scan', dir)
    const text = errText()
    expect(text, 'the total leads').toMatch(/\d+ file\(s\) could not be LOADED/)
    expect(text, 'each cause carries its own count').toMatch(/\d+× /)
    expect(text, 'and the remedy is the import, not the config').toContain(
      'a `theme` in your config cannot help',
    )
  })
})
