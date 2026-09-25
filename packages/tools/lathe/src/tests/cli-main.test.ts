/**
 * The bin's own layer: finding the config, resolving its paths, `--version`,
 * colour, and where errors go.
 *
 * Every case here was a first-hour surprise: running `lathe` from `src/` found
 * no config and silently generated with defaults; the config's paths resolved
 * against the shell's cwd while the docs said "relative to the config file";
 * `--version` printed help; ANSI codes landed in CI logs and pipes.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findConfigFile, loadConfig, main, rebase } from '../cli/main'
import { shouldColor } from '../cli/report'
import pkg from '../../package.json' with { type: 'json' }

const SPEC = `openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /a:
    get:
      operationId: getA
      tags: [a]
      responses: { '200': { content: { application/json: { schema: { type: string } } } } }
`

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'lathe-main-'))
  mkdirSync(join(root, '.git'))
  mkdirSync(join(root, 'api'))
  mkdirSync(join(root, 'src', 'deep'), { recursive: true })
  writeFileSync(join(root, 'api', 'openapi.yaml'), SPEC)
  writeFileSync(
    join(root, 'pyreon.config.ts'),
    "export default { lathe: { input: './api/openapi.yaml', output: './src/gen', plugins: ['schemas', 'client'] } }\n",
  )
  return root
}

async function capture(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = []
  const err: string[] = []
  const o = process.stdout.write.bind(process.stdout)
  const e = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((s: string) => (out.push(String(s)), true)) as typeof process.stdout.write
  process.stderr.write = ((s: string) => (err.push(String(s)), true)) as typeof process.stderr.write
  try {
    const code = await fn()
    return { code, out: out.join(''), err: err.join('') }
  } finally {
    process.stdout.write = o
    process.stderr.write = e
  }
}

describe('config discovery', () => {
  it('finds the config by walking UP from a subdirectory', () => {
    const root = repo()
    expect(findConfigFile(join(root, 'src', 'deep'))).toBe(join(root, 'pyreon.config.ts'))
  })

  it('stops at the repository root rather than adopting a config above it', () => {
    const outer = mkdtempSync(join(tmpdir(), 'lathe-outer-'))
    writeFileSync(join(outer, 'pyreon.config.ts'), 'export default {}\n')
    const inner = join(outer, 'checkout')
    mkdirSync(join(inner, '.git'), { recursive: true })
    expect(findConfigFile(inner)).toBeUndefined()
  })

  it('--config names the file explicitly, and a missing one is an error', () => {
    const root = repo()
    expect(findConfigFile('/', join(root, 'pyreon.config.ts'))).toBe(join(root, 'pyreon.config.ts'))
    expect(() => findConfigFile(root, 'nope.config.ts')).toThrow(/does not exist/)
  })
})

describe('config paths are relative to the config FILE', () => {
  it('rebases input/output (and per-project paths) onto the working directory', () => {
    expect(rebase({ input: './api/x.yaml', output: './gen' }, '/r', '/r/src')).toEqual({
      input: '../api/x.yaml',
      output: '../gen',
    })
    expect(
      rebase({ projects: [{ name: 'p', input: 'a.yaml', output: 'out' }] }, '/r', '/r/pkg').projects,
    ).toEqual([{ name: 'p', input: '../a.yaml', output: '../out' }])
    expect(rebase({ input: '/abs/x.yaml' }, '/r', '/r/src').input).toBe('/abs/x.yaml')
  })

  it('generates to the SAME place whichever directory it is run from', async () => {
    const root = repo()
    const r = await capture(() => main(['generate'], join(root, 'src', 'deep')))
    expect(r.code, r.err).toBe(0)
    expect(existsSync(join(root, 'src', 'gen', 'client.ts'))).toBe(true)
    expect(existsSync(join(root, 'src', 'deep', 'src'))).toBe(false)
  })

  it('a watcher can re-read an EDITED config (cache-busted import)', async () => {
    const root = repo()
    const first = await loadConfig(root)
    writeFileSync(
      join(root, 'pyreon.config.ts'),
      "export default { lathe: { input: './api/openapi.yaml', output: './elsewhere' } }\n",
    )
    const reloaded = await loadConfig(root, first.file, 'edit-1')
    expect(reloaded.section?.output).toBe('elsewhere')
  })
})

describe('the bin surface', () => {
  it('--version prints the package version, not the help', async () => {
    const r = await capture(() => main(['--version'], tmpdir()))
    expect(r.code).toBe(0)
    expect(r.out.trim()).toBe(pkg.version)
  })

  it('errors go to STDERR with a usage exit code', async () => {
    const r = await capture(() => main(['generate', '--josn'], tmpdir()))
    expect(r.code).toBe(2)
    expect(r.out).toBe('')
    expect(r.err).toContain('Did you mean `--json`?')
  })

  it('a broken config fails loudly instead of falling back to defaults', async () => {
    const root = repo()
    writeFileSync(join(root, 'pyreon.config.ts'), 'export default {{{\n')
    const r = await capture(() => main(['generate'], root))
    expect(r.code).toBe(1)
    expect(r.err).toContain('failed to load pyreon.config.ts')
  })

  it('writes a --dry-run plan without touching the tree', async () => {
    const root = repo()
    const r = await capture(() => main(['generate', '--dry-run'], root))
    expect(r.code).toBe(0)
    expect(r.out).toContain('DRY RUN')
    expect(existsSync(join(root, 'src', 'gen'))).toBe(false)
    expect(readFileSync(join(root, 'api', 'openapi.yaml'), 'utf8')).toBe(SPEC)
  })
})

describe('colour follows the destination', () => {
  it('only a TTY gets colour, NO_COLOR and TERM=dumb turn it off, FORCE_COLOR turns it on', () => {
    expect(shouldColor({ isTTY: true }, {})).toBe(true)
    expect(shouldColor({ isTTY: false }, {})).toBe(false)
    expect(shouldColor({ isTTY: true }, { NO_COLOR: '1' })).toBe(false)
    expect(shouldColor({ isTTY: true }, { TERM: 'dumb' })).toBe(false)
    expect(shouldColor({ isTTY: false }, { FORCE_COLOR: '1' })).toBe(true)
    expect(shouldColor({ isTTY: true }, { FORCE_COLOR: '0' })).toBe(false)
  })

  it('a piped run carries no escape codes', async () => {
    const root = repo()
    const r = await capture(() => main(['generate'], root))
    expect(r.out).not.toContain(String.fromCharCode(27))
  })
})
