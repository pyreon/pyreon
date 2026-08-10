import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli, runScan } from '../run'

function fixture(name: string, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), `atlas-${name}-`))
  mkdirSync(join(dir, 'src'), { recursive: true })
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(dir, 'src', rel), content)
  return dir
}

describe('runScan', () => {
  it('discovers components, builds a verified catalog, and writes assets', async () => {
    const dir = fixture('scan', {
      'Button.tsx': `export function Button(props: { label: string; variant: 'solid' | 'ghost' }) { return null }`,
    })
    try {
      const r = await runScan({ cwd: dir })
      expect(r.components).toBe(1)
      expect(r.scenarios).toBeGreaterThan(0)
      expect(r.guide).toContain('## Button')
      expect(r.llms).toContain('Button')
      expect(r.catalogPath).toBe(join(dir, 'atlas-catalog.json'))
      const catalog = JSON.parse(readFileSync(r.catalogPath!, 'utf8'))
      expect(catalog.version).toBe(2)
      expect(catalog.components[0].name).toBe('Button')
      expect(readFileSync(r.guidePath!, 'utf8')).toContain('# Agent Guide')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not write files when write:false', async () => {
    const dir = fixture('nowrite', { 'A.tsx': `export function A(props: { x: string }) { return null }` })
    try {
      const r = await runScan({ cwd: dir, write: false })
      expect(r.components).toBe(1)
      expect(r.catalogPath).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('finds nothing in an empty project and writes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-empty-'))
    try {
      const r = await runScan({ cwd: dir })
      expect(r.components).toBe(0)
      expect(r.catalogPath).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('runCli', () => {
  let stdout: string
  let stderr: string

  beforeEach(() => {
    stdout = ''
    stderr = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(((s: unknown) => {
      stdout += String(s)
      return true
    }) as never)
    vi.spyOn(process.stderr, 'write').mockImplementation(((s: unknown) => {
      stderr += String(s)
      return true
    }) as never)
  })
  afterEach(() => vi.restoreAllMocks())

  it('scan prints a summary and returns 0 when nothing fails', async () => {
    // `title` OPTIONAL on purpose: a REQUIRED name prop makes the generated
    // Empty edge-case scenario fail the static a11y check — the red-exit spec
    // below covers that path.
    const dir = fixture('cli', { 'Card.tsx': `export function Card(props: { title?: string }) { return null }` })
    try {
      expect(await runCli(['scan', dir])).toBe(0)
      expect(stdout).toContain('discovered 1 component')
      expect(stdout).toContain('atlas-catalog.json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scan returns 1 and names the failing scenarios when a check fails', async () => {
    // A REQUIRED name prop: the edge-case plugin generates an Empty scenario
    // (an empty string is a legal value for `string`, so a caller CAN pass it)
    // and the static a11y check fails it. A red scan must be a red exit —
    // otherwise wiring `atlas scan` into CI gates nothing.
    const dir = fixture('cli', { 'Card.tsx': `export function Card(props: { title: string }) { return null }` })
    try {
      expect(await runCli(['scan', dir])).toBe(1)
      expect(stdout).toContain('1 failing')
      // The scenario is still named — that invariant is unchanged.
      expect(stderr).toContain('card--empty')
      // And now the CHECK and its finding are named too. A bare id said WHERE
      // to look and withheld WHAT was wrong, which meant opening the catalog
      // JSON to learn which of six checks had failed.
      // The CHECK, its stable CODE, and the fix — the code is what a consumer
      // greps for or branches on, and the fix travels with the finding.
      expect(stderr).toContain('a11y [missing-accessible-name]:')
      expect(stderr).toContain('→ Give "title" a non-empty value')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scan names WHICH check failed in the per-check tally', async () => {
    // The line that answers "which check?" without a second command.
    const dir = fixture('cli', { 'Card.tsx': `export function Card(props: { title: string }) { return null }` })
    try {
      await runCli(['scan', dir])
      expect(stdout).toContain('checks:')
      expect(stdout).toMatch(/a11y \d+\/\d+ ✗/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scan reports the checks that did NOT run, rather than omitting them', async () => {
    // A check that is structurally unavailable in a Node scan is a different
    // statement from one that ran and passed; silence conflates them.
    const dir = fixture('cli', { 'Card.tsx': `export function Card(props: { title?: string }) { return null }` })
    try {
      await runCli(['scan', dir])
      expect(stdout).toContain('not run:')
      expect(stdout).toContain('verify-browser')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('verify scopes to ONE component and leaves the others unmounted', async () => {
    // The point of the command: decoration and verification are where the cost
    // is, and a question about Button should not verify Card.
    const dir = fixture('verify-scope', {
      'Button.tsx': `export function Button(props: { label?: string }) { return null }`,
      'Card.tsx': `export function Card(props: { title?: string }) { return null }`,
    })
    try {
      expect(await runCli(['verify', 'Button', '--cwd', dir])).toBe(0)
      expect(stdout).toContain('1 component(s)')
      expect(stdout).not.toContain('Card')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('verify NEVER writes the catalog — a scoped run would replace it wholesale', async () => {
    // A one-component catalog written over the real one silently breaks the
    // agent guide, the MCP tools and `atlas check` for every other component
    // until the next full scan.
    const dir = fixture('verify-nowrite', {
      'Button.tsx': `export function Button(props: { label?: string }) { return null }`,
      'Card.tsx': `export function Card(props: { title?: string }) { return null }`,
    })
    try {
      await runCli(['scan', dir])
      const before = readFileSync(join(dir, 'atlas-catalog.json'), 'utf8')
      await runCli(['verify', 'Button', '--cwd', dir])
      expect(readFileSync(join(dir, 'atlas-catalog.json'), 'utf8')).toBe(before)
      expect(JSON.parse(before).components).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('verify returns 1 for a name that matched nothing, and suggests', async () => {
    // The failure this command most has to get right: filtering to nothing
    // reports zero scenarios and zero failures, which reads as a pass.
    const dir = fixture('verify-typo', {
      'Button.tsx': `export function Button(props: { label?: string }) { return null }`,
    })
    try {
      expect(await runCli(['verify', 'Buton', '--cwd', dir])).toBe(1)
      expect(stderr).toContain('no component named "Buton"')
      expect(stderr).toContain('Button')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('verify --json emits a machine report an agent can branch on', async () => {
    const dir = fixture('verify-json', {
      'Button.tsx': `export function Button(props: { label?: string }) { return null }`,
    })
    try {
      await runCli(['verify', 'Button', '--cwd', dir, '--json'])
      const report = JSON.parse(stdout)
      expect(report.ok).toBe(true)
      expect(report.component).toBe('Button')
      expect(Array.isArray(report.tallies)).toBe(true)
      expect(report.tallies.some((t: { key: string }) => t.key === 'a11y')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('verify --json reports an unmatched name as ok:false, not an empty pass', async () => {
    const dir = fixture('verify-json-typo', {
      'Button.tsx': `export function Button(props: { label?: string }) { return null }`,
    })
    try {
      expect(await runCli(['verify', 'Nope', '--cwd', dir, '--json'])).toBe(1)
      const report = JSON.parse(stdout)
      expect(report.ok).toBe(false)
      expect(report.error).toContain('Nope')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('verify returns 1 and names the failing check', async () => {
    const dir = fixture('verify-fail', {
      'Card.tsx': `export function Card(props: { title: string }) { return null }`,
    })
    try {
      expect(await runCli(['verify', 'Card', '--cwd', dir])).toBe(1)
      // The CHECK, its stable CODE, and the fix — the code is what a consumer
      // greps for or branches on, and the fix travels with the finding.
      expect(stderr).toContain('a11y [missing-accessible-name]:')
      expect(stderr).toContain('→ Give "title" a non-empty value')
      expect(stdout).toContain('1 failing')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('verify with no name reports the whole catalog', async () => {
    const dir = fixture('verify-all', {
      'Button.tsx': `export function Button(props: { label?: string }) { return null }`,
      'Card.tsx': `export function Card(props: { title?: string }) { return null }`,
    })
    try {
      expect(await runCli(['verify', '--cwd', dir])).toBe(0)
      expect(stdout).toContain('2 component(s)')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scan --check reports no movement and exits 0 when nothing changed', async () => {
    const dir = fixture('ratchet-same', {
      'Button.tsx': `export function Button(props: { label?: string }) { return null }`,
    })
    try {
      await runCli(['scan', dir])
      expect(await runCli(['scan', dir, '--check'])).toBe(0)
      expect(stdout).toContain('no change in any check')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scan --check exits 1 when a check starts failing', async () => {
    const dir = fixture('ratchet-worse', {
      'Card.tsx': `export function Card(props: { title?: string }) { return null }`,
    })
    try {
      await runCli(['scan', dir])
      // Same component, now with a REQUIRED name prop: the generated Empty
      // edge case starts failing the static a11y check.
      writeFileSync(
        join(dir, 'src', 'Card.tsx'),
        `export function Card(props: { title: string }) { return null }`,
      )
      expect(await runCli(['scan', dir, '--check'])).toBe(1)
      expect(stdout).toContain('REGRESSED')
      expect(stdout).toContain('now failing: a11y')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scan --check calls LOST COVERAGE a regression, though the counts improve', async () => {
    // The failure the ratchet uniquely catches. Baseline has failing checks;
    // the second run cannot mount, so those checks SKIP — `2 failing` becomes
    // `0 failing` and the absolute summary reads as a fix.
    const dir = fixture('ratchet-coverage', {
      'Boom.tsx': `export function Boom(props: { label?: string }) { throw new Error('boom') }`,
    })
    try {
      await runCli(['scan', dir])
      expect(stdout).toContain('failing')
      stdout = ''
      expect(await runCli(['scan', dir, '--check', '--no-mount'])).toBe(1)
      expect(stdout).toContain('0 failing')
      expect(stdout).toContain('REGRESSED')
      expect(stdout).toContain('stopped running')
      expect(stdout).toContain('the failure did not go away, the check did')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scan --check does NOT rewrite the baseline it compares against', async () => {
    // A ratchet that overwrites its own baseline compares a run to itself and
    // can never report a regression again.
    const dir = fixture('ratchet-nowrite', {
      'Button.tsx': `export function Button(props: { label?: string }) { return null }`,
    })
    try {
      await runCli(['scan', dir])
      const before = readFileSync(join(dir, 'atlas-catalog.json'), 'utf8')
      await runCli(['scan', dir, '--check'])
      expect(readFileSync(join(dir, 'atlas-catalog.json'), 'utf8')).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scan --check is NOT a failure when there is no baseline yet', async () => {
    // Making the very first --check run red for everybody is how a ratchet
    // gets disabled on day one.
    const dir = fixture('ratchet-first', {
      'Button.tsx': `export function Button(props: { label?: string }) { return null }`,
    })
    try {
      expect(await runCli(['scan', dir, '--check'])).toBe(0)
      expect(stderr).toContain('nothing to compare')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scan returns 1 when nothing is found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-empty2-'))
    try {
      expect(await runCli(['scan', dir])).toBe(1)
      expect(stderr).toContain('no components found')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--help prints usage and returns 0', async () => {
    expect(await runCli(['--help'])).toBe(0)
    expect(stdout).toContain('Usage:')
  })

  it('no args prints help and returns 0', async () => {
    expect(await runCli([])).toBe(0)
    expect(stdout).toContain('atlas —')
  })

  it('an unknown command returns 1', async () => {
    expect(await runCli(['bogus'])).toBe(1)
    expect(stderr).toContain('unknown command')
  })
})
