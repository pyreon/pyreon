/**
 * The SHIPPED bin with `--plugins` naming third-party modules -- a path and a
 * package in `node_modules` -- one of them ASYNC.
 *
 * What only this can prove: the bin's real resolver (the cwd, `node_modules`,
 * `exports` with the `import` condition) and the real `import()`, and that the
 * CLI generates through `generateAsync`. Exit codes only; files are read from
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
const DIR = join(ROOT, 'src', 'tests', '.generated', 'bin-cli-plugins')

// A path plugin, built with the published entry, with an ASYNC emit.
const LOCAL = `
import { definePlugin } from '@pyreon/lathe'
export default definePlugin({
  name: 'local-paths',
  async emit({ doc }) {
    await new Promise((r) => setTimeout(r, 1))
    return [{ path: 'extras/paths.json', contents: JSON.stringify(doc.operations.map((o) => o.id)) + '\\n' }]
  },
})
`

// A package plugin that imports nothing: the brand is a REGISTERED symbol, so
// a plugin need not even load Lathe to be recognised. A factory default export.
const PACKAGE = `
export default function tagCount() {
  const plugin = {
    name: 'tag-count',
    emit: ({ doc }) => [{ path: 'extras/tags.json', contents: JSON.stringify(doc.operations.length) + '\\n' }],
  }
  Object.defineProperty(plugin, Symbol.for('pyreon.lathe.plugin'), { value: true })
  return plugin
}
`

const node = (...args: string[]) =>
  spawnSync(process.execPath.includes('bun') ? 'node' : process.execPath, [BIN, ...args], {
    cwd: DIR,
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 60_000,
  })

describe('the shipped bin with --plugins modules', { timeout: 120_000 }, () => {
  beforeAll(() => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(join(DIR, 'node_modules', 'lathe-plugin-tags', 'dist'), { recursive: true })
    mkdirSync(join(DIR, '.git'))
    writeFileSync(join(DIR, 'openapi.json'), CUSTOMIZE_SPEC)
    writeFileSync(join(DIR, 'local-plugin.mjs'), LOCAL)
    writeFileSync(
      join(DIR, 'node_modules', 'lathe-plugin-tags', 'package.json'),
      JSON.stringify({ name: 'lathe-plugin-tags', type: 'module', exports: { '.': { import: './dist/index.mjs', require: './missing.cjs' } } }),
    )
    writeFileSync(join(DIR, 'node_modules', 'lathe-plugin-tags', 'dist', 'index.mjs'), PACKAGE)
  })
  afterAll(() => rmSync(DIR, { recursive: true, force: true }))

  it('the built entries exist -- a skipped suite must not pass as coverage', () => {
    expect(existsSync(join(ROOT, 'lib', 'cli.js'))).toBe(true)
  })

  it('generates with a path plugin and a package plugin, then check agrees', () => {
    const args = ['openapi.json', '--out', 'gen', '--plugins', 'schemas,./local-plugin.mjs,lathe-plugin-tags']
    expect(node('generate', ...args).status).toBe(0)
    expect(JSON.parse(readFileSync(join(DIR, 'gen', 'extras', 'paths.json'), 'utf8'))).toContain('getPetById')
    expect(JSON.parse(readFileSync(join(DIR, 'gen', 'extras', 'tags.json'), 'utf8'))).toBeGreaterThan(0)
    expect(node('check', ...args).status).toBe(0)
  })

  it('an unknown name is a usage error', () => {
    expect(node('generate', 'openapi.json', '--out', 'gen2', '--plugins', 'schemas,querys').status).toBe(2)
    expect(existsSync(join(DIR, 'gen2'))).toBe(false)
  })
})
