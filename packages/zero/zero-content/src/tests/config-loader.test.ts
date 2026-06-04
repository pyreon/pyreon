/**
 * content.config.{ts,...} loader — file discovery + dynamic import +
 * shape validation.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultLoader,
  findConfigFile,
  loadConfig,
  validateConfigShape,
} from '../config-loader'

describe('findConfigFile', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-content-cfg-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns null when no candidate file exists', async () => {
    expect(await findConfigFile(tmpDir)).toBeNull()
  })

  it('finds content.config.ts', async () => {
    const abs = path.join(tmpDir, 'content.config.ts')
    await fs.writeFile(abs, 'export default {}')
    expect(await findConfigFile(tmpDir)).toBe(abs)
  })

  it('prefers .ts over .js when both exist', async () => {
    const tsAbs = path.join(tmpDir, 'content.config.ts')
    const jsAbs = path.join(tmpDir, 'content.config.js')
    await fs.writeFile(tsAbs, 'export default {}')
    await fs.writeFile(jsAbs, 'export default {}')
    expect(await findConfigFile(tmpDir)).toBe(tsAbs)
  })

  it('falls back to .js when .ts is missing', async () => {
    const jsAbs = path.join(tmpDir, 'content.config.js')
    await fs.writeFile(jsAbs, 'export default {}')
    expect(await findConfigFile(tmpDir)).toBe(jsAbs)
  })
})

describe('validateConfigShape', () => {
  it('accepts a valid config', () => {
    expect(() =>
      validateConfigShape(
        { collections: { docs: { type: 'pages', schema: {} } } },
        '/abs/content.config.ts',
        '/abs',
      ),
    ).not.toThrow()
  })

  it('throws when the value is not an object', () => {
    expect(() =>
      validateConfigShape(null, '/abs/content.config.ts', '/abs'),
    ).toThrow('defineConfig must return an object')
  })

  it('throws when collections is missing', () => {
    expect(() =>
      validateConfigShape({}, '/abs/content.config.ts', '/abs'),
    ).toThrow('defineConfig must include a "collections" map')
  })

  it('throws when collections is an array', () => {
    expect(() =>
      validateConfigShape(
        { collections: [] },
        '/abs/content.config.ts',
        '/abs',
      ),
    ).toThrow('"collections" map')
  })

  it('throws when a collection is null', () => {
    expect(() =>
      validateConfigShape(
        { collections: { docs: null } },
        '/abs/content.config.ts',
        '/abs',
      ),
    ).toThrow('must be a defineCollection')
  })

  it('throws when a collection is a string', () => {
    expect(() =>
      validateConfigShape(
        { collections: { docs: 'not an object' } },
        '/abs/content.config.ts',
        '/abs',
      ),
    ).toThrow('must be a defineCollection')
  })

  it('throws when a collection has invalid type', () => {
    expect(() =>
      validateConfigShape(
        { collections: { docs: { type: 'foo', schema: {} } } },
        '/abs/content.config.ts',
        '/abs',
      ),
    ).toThrow(`invalid type "foo"`)
  })

  it('throws when a collection is missing a schema', () => {
    expect(() =>
      validateConfigShape(
        { collections: { docs: { type: 'pages' } } },
        '/abs/content.config.ts',
        '/abs',
      ),
    ).toThrow('missing a schema')
  })
})

describe('loadConfig', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-content-load-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns null when no config exists', async () => {
    const result = await loadConfig(tmpDir, async () => ({}))
    expect(result).toBeNull()
  })

  it('loads + returns the config', async () => {
    await fs.writeFile(path.join(tmpDir, 'content.config.js'), '')
    const loader = vi.fn().mockResolvedValue({
      default: {
        collections: {
          docs: { type: 'pages', schema: { whatever: true } },
        },
      },
    })
    const result = await loadConfig(tmpDir, loader)
    expect(result).not.toBeNull()
    expect(result!.config.collections.docs!.type).toBe('pages')
  })

  it('throws when the loaded module has no default export', async () => {
    await fs.writeFile(path.join(tmpDir, 'content.config.js'), '')
    const loader = vi.fn().mockResolvedValue({})
    await expect(loadConfig(tmpDir, loader)).rejects.toThrow(
      'has no default export',
    )
  })
})

describe('defaultLoader', () => {
  // We don't unit-test `defaultLoader` against a freshly-created tmp
  // file — bun's vitest runner refuses to `import()` files outside the
  // workspace. The function is exercised end-to-end via the plugin
  // integration tests, which use Vite's ssrLoadModule path.
  it('is exported and callable', () => {
    expect(typeof defaultLoader).toBe('function')
  })
})
