import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FIRST_PARTY_PLUGINS } from '../../../../../scripts/native-first-party-plugins'

const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name)
    return statSync(file).isDirectory() ? sources(file) : name.endsWith('.ts') ? [file] : []
  })
}

const owners = readdirSync(PACKAGES).flatMap((category) => {
  const categoryPath = join(PACKAGES, category)
  if (!statSync(categoryPath).isDirectory()) return []
  return readdirSync(categoryPath).flatMap((name) => {
    const root = join(categoryPath, name)
    if (!existsSync(join(root, 'package.json'))) return []
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    if (manifest.pyreon?.native?.plugin === undefined) return []
    return [{ root, manifest, name: manifest.name as string }]
  })
})

it('loads every published first-party native plugin in the shared corpus catalog', () => {
  expect(owners.length).toBeGreaterThan(30)
  expect(FIRST_PARTY_PLUGINS.map((plugin) => plugin.name).sort()).toEqual(
    owners.map((owner) => owner.name).sort(),
  )
})

describe.each(owners)('$name package-owned tooling boundary', ({ root, manifest, name }) => {
  const entry = join(root, 'src/native-plugin.ts')
  const directory = join(root, 'src/native-plugin')
  const files = [entry, ...(existsSync(directory) ? sources(directory) : [])]

  it('ships an independent optional compiler entry', () => {
    expect(existsSync(entry), name).toBe(true)
    expect(manifest.exports['./native-plugin'].import).toBe(manifest.pyreon.native.plugin)
    expect(manifest.pyreon.native.modules).toContain(name)
    expect(manifest.peerDependenciesMeta['@pyreon/native-compiler'].optional).toBe(true)
    expect(readFileSync(join(root, 'src/index.ts'), 'utf8')).not.toContain('native-plugin')
  })

  it.each(files)('%s imports only the public compiler facade', (file) => {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(
      /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]@pyreon\/native-compiler(?:\/([^'"]*))?['"]/g,
    ))
      expect(match[1], `${file}: ${match[0]}`).toBe('plugin-api')
    expect(source, file).not.toMatch(
      /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:\.\.\/)+native\/compiler\//,
    )
  })
})
