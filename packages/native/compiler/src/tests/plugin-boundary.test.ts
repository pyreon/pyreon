import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A plugin lowers a library through the PUBLIC interface only (the facade, the IR
// types, its own helpers). Reaching into an emitter or the parser would put the
// compiler core back inside the plugin — the dependency this directory exists to
// remove — and silently re-couple it to emitter internals.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS = join(SRC, 'plugins')
const FORBIDDEN = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]\.\.\/(?:emit-swift|emit-kotlin|parse)(?:\.[jt]s)?['"]/

// A plugin may keep its emitters in a subdirectory, so the scan walks the whole tree.
function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const rel = prefix === '' ? name : `${prefix}/${name}`
    return statSync(join(dir, name)).isDirectory() ? walk(join(dir, name), rel) : name.endsWith('.ts') ? [rel] : []
  })
}

describe('plugin boundary', () => {
  const files = walk(PLUGINS)

  it('scans the plugins directory (a vacuous scan would pass on nothing)', () => {
    expect(files).toEqual(expect.arrayContaining(['coolgrid.ts', 'elements.ts', 'services.ts']))
  })

  it.each(files)('%s imports nothing from emit-swift, emit-kotlin or parse', (file) => {
    const source = readFileSync(join(PLUGINS, file), 'utf8')
    const hit = source.split('\n').find((line) => FORBIDDEN.test(line))
    expect(hit, `plugins/${file} imports an emitter or the parser: ${hit}`).toBeUndefined()
  })
})

// A package-owned plugin lives OUTSIDE this package, so the boundary is a package
// boundary: the only door into the compiler is the published `plugin-api` subpath.
// The charts plugin is the first-party instance; the same rule holds for any plugin
// shipped by a library.
describe.each([
  ['@pyreon/charts', 'charts', ['plugin.ts', 'hosts.ts', 'swift-hosts.ts', 'kotlin-hosts.ts', 'stubs.ts', 'facade.ts']],
  ['@pyreon/flow', 'flow', ['plugin.ts', 'swift.ts', 'kotlin.ts', 'recognize.ts', 'stubs.ts', 'facade.ts']],
] as const)('package-owned plugin boundary (%s)', (_pkg, dirName, expected) => {
  const CHARTS_PLUGIN = join(SRC, `../../../fundamentals/${dirName}/src/native-plugin`)
  const COMPILER_SPECIFIER = /['"]@pyreon\/native-compiler(?:\/([^'"]*))?['"]/
  const COMPILER_RELATIVE = /['"](?:\.\.\/)+native\/compiler\//
  const charts = walk(CHARTS_PLUGIN).filter((f) => !f.includes('tests/'))

  it('finds the plugin sources (a vacuous scan would pass on nothing)', () => {
    expect(charts).toEqual(expect.arrayContaining([...expected]))
  })

  it.each(charts)('%s reaches the compiler only through @pyreon/native-compiler/plugin-api', (file) => {
    const lines = readFileSync(join(CHARTS_PLUGIN, file), 'utf8').split('\n')
    for (const line of lines) {
      const m = COMPILER_SPECIFIER.exec(line)
      if (m !== null) expect(m[1], `${file}: ${line}`).toBe('plugin-api')
      expect(COMPILER_RELATIVE.test(line), `${file} reaches into the compiler's sources: ${line}`).toBe(false)
    }
  })
})
