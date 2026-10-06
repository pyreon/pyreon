import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listPluginPackages } from '../discover-plugins'

// Edges of plugin discovery that a well-formed app never reaches but a broken
// one does: no manifest at all, and a package that declares a plugin wrongly.

describe('listPluginPackages — edges', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-native-discover-edges-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function addPackage(name: string, pyreon: unknown) {
    const dir = join(root, 'node_modules', ...name.split('/'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, pyreon }))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies: { [name]: '1' } }))
  }

  it('finds nothing in a directory that has no package.json', () => {
    expect(listPluginPackages(root)).toEqual([])
  })

  it.each([
    ['a number', 123],
    ['an empty string', ''],
    ['an object', { path: 'native/plugin.mjs' }],
  ])('refuses a plugin declared as %s, naming the package', (_label, declared) => {
    addPackage('@acme/odd', { native: { plugin: declared } })
    expect(() => listPluginPackages(root)).toThrow(
      /Package "@acme\/odd" declares pyreon\.native\.plugin that is not a path string/,
    )
  })

  it('ignores a dependency that declares no plugin at all', () => {
    addPackage('@acme/plain', { native: {} })
    expect(listPluginPackages(root)).toEqual([])
  })
})
