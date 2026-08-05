import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { resolveOut } from '../out-path'
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
      expect(catalog.version).toBe(1)
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
      expect(stderr).toContain('failing scenario(s): card--empty')
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

describe('resolveOut — where an explicit --out lands', () => {
  /**
   * `atlas build [dir] --out <path>` takes a project dir AND an output path,
   * and `buildStatic` resolves a relative `out` against its `cwd` option — so
   * without this, standing at a repo root and running
   *
   *   atlas build packages/ui/components --out docs/dist/atlas
   *
   * emitted into `packages/ui/components/docs/dist/atlas`. Silently, and with
   * a success message, so the only symptom was a site that was not where it
   * was asked for — which is how it reached a CI workflow.
   */
  it('resolves a relative path against the shell cwd, not the scanned project', () => {
    expect(resolveOut('docs/dist/atlas')).toBe(resolve(process.cwd(), 'docs/dist/atlas'))
    // The consequence, stated directly: a project dir on the argv must not
    // appear in the output path.
    expect(resolveOut('docs/dist/atlas')).not.toContain(join('packages', 'ui', 'components'))
  })

  it('leaves an absolute path alone', () => {
    expect(resolveOut(resolve('/tmp/site'))).toBe(resolve('/tmp/site'))
  })

  it('leaves the DEFAULT alone', () => {
    // Not rewritten on purpose: `atlas-dist` is a path the tool chose, and it
    // belongs beside the project it documents — the same place `atlas scan`
    // writes `atlas-catalog.json`. Only a path someone TYPED follows the shell.
    expect(resolveOut(undefined)).toBeUndefined()
  })
})
