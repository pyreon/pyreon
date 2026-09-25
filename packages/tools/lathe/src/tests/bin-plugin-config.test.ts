/**
 * The SHIPPED bin, driven by a real `pyreon.config.mjs` that uses the plugin
 * API, `filters`, `operations`, `naming` and `format` — the way an app does.
 *
 * What only this can prove: that a plugin created by the PUBLISHED entry
 * (`@pyreon/lathe`, `lib/index.js`) is recognised by the PUBLISHED CLI
 * (`lib/cli.js`), which is a separate bundle — the brand is a registered
 * symbol precisely so two copies agree — and that `format` runs before both
 * the write and `check`'s comparison.
 *
 * Exit codes only for the spawned process; the files it wrote are read from
 * disk. It reads `lib/`: run after `bun scripts/bootstrap.ts`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CUSTOMIZE_SPEC } from './helpers/customize-spec'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BIN = join(ROOT, 'bin', 'lathe.js')
// Inside the package, so `@pyreon/lathe` resolves by self-reference to lib/.
const DIR = join(ROOT, 'src', 'tests', '.generated', 'bin-plugin')

const CONFIG = `
import { definePlugin } from '@pyreon/lathe'

const pathTable = definePlugin({
  name: 'path-table',
  emit: ({ doc }) => [{
    path: 'extras/paths.json',
    contents: JSON.stringify(Object.fromEntries(doc.operations.map((o) => [o.id, o.path])), null, 2) + '\\n',
  }],
})

export default {
  lathe: {
    input: './openapi.json',
    output: './gen',
    plugins: ['schemas', 'client', 'queries', pathTable],
    filters: { include: { tag: ['pets', 'store'] } },
    operations: { listPets: { hook: 'usePetList' } },
    naming: { file: ({ default: stem }) => stem + '-api' },
    // A stand-in formatter: deterministic, and visible in every file.
    format: (code, path) => (path.endsWith('.ts') ? code + '// formatted\\n' : code),
  },
}
`

const node = (...args: string[]) =>
  spawnSync(process.execPath.includes('bun') ? 'node' : process.execPath, [BIN, ...args], {
    cwd: DIR,
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 60_000,
  })

describe('the shipped bin with a plugin-using config', { timeout: 120_000 }, () => {
  beforeAll(() => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(DIR, { recursive: true })
    // A `.git` bounds the upward config search at this directory.
    mkdirSync(join(DIR, '.git'))
    writeFileSync(join(DIR, 'openapi.json'), CUSTOMIZE_SPEC)
    writeFileSync(join(DIR, 'pyreon.config.mjs'), CONFIG)
  })
  afterAll(() => rmSync(DIR, { recursive: true, force: true }))

  it('the built entries exist -- a skipped suite must not pass as coverage', () => {
    expect(existsSync(join(ROOT, 'lib', 'cli.js'))).toBe(true)
    expect(existsSync(join(ROOT, 'lib', 'index.js'))).toBe(true)
  })

  it('generate honours every hook, then check agrees with what it wrote', () => {
    expect(node('generate').status).toBe(0)
    const paths = JSON.parse(readFileSync(join(DIR, 'gen', 'extras', 'paths.json'), 'utf8'))
    expect(Object.keys(paths).sort()).toEqual(['createPet', 'getPetById', 'listOrders', 'listPets'])
    const queries = readFileSync(join(DIR, 'gen', 'queries', 'pets-api.ts'), 'utf8')
    expect(queries).toContain('export function usePetList<')
    expect(queries.endsWith('// formatted\n')).toBe(true)
    expect(existsSync(join(DIR, 'gen', 'endpoints', 'users-api.ts'))).toBe(false)
    // Formatted output is CURRENT: check compares after formatting.
    expect(node('check').status).toBe(0)
  })

  it('check reports a plugin file edited by hand as stale', () => {
    writeFileSync(join(DIR, 'gen', 'extras', 'paths.json'), '{}\n')
    expect(node('check').status).toBe(1)
    expect(node('generate').status).toBe(0)
    expect(node('check').status).toBe(0)
  })
})
