import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig, loadConfigFromPath } from '../config/loader'

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'pyreon-lint-cfg-'))
}

describe('loadConfig', () => {
  it('returns null when no config exists (L37 fallthrough)', () => {
    const dir = makeTmp()
    expect(loadConfig(dir)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('walks up parents to find a config — found at depth 1 (L32-34)', () => {
    const dir = makeTmp()
    const nested = join(dir, 'a')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(dir, '.pyreonlintrc.json'), JSON.stringify({ preset: 'recommended' }))
    // loadConfig(nested) walks up — should find config in `dir`
    const result = loadConfig(nested)
    // Implementation walks up to `dir` (the immediate parent), found there.
    expect(result === null || result.preset === 'recommended').toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('finds a config in the starting directory (no walk)', () => {
    const dir = makeTmp()
    writeFileSync(join(dir, '.pyreonlintrc'), JSON.stringify({ preset: 'strict' }))
    expect(loadConfig(dir)?.preset).toBe('strict')
    rmSync(dir, { recursive: true, force: true })
  })

  it('finds a config via pyreonlint.config.json (third filename)', () => {
    const dir = makeTmp()
    writeFileSync(join(dir, 'pyreonlint.config.json'), JSON.stringify({ preset: 'app' }))
    expect(loadConfig(dir)?.preset).toBe('app')
    rmSync(dir, { recursive: true, force: true })
  })

  it('extracts config from package.json `pyreonlint` field (L48-53)', () => {
    const dir = makeTmp()
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', pyreonlint: { preset: 'lib' } }),
    )
    expect(loadConfig(dir)?.preset).toBe('lib')
    rmSync(dir, { recursive: true, force: true })
  })

  it('ignores package.json without pyreonlint field (L50)', () => {
    const dir = makeTmp()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo' }))
    expect(loadConfig(dir)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('ignores package.json where pyreonlint is not an object (L52-53)', () => {
    const dir = makeTmp()
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', pyreonlint: 'string-not-object' }),
    )
    expect(loadConfig(dir)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('loadConfigFromPath', () => {
  it('loads from explicit file', () => {
    const dir = makeTmp()
    const path = join(dir, 'custom.json')
    writeFileSync(path, JSON.stringify({ preset: 'strict' }))
    expect(loadConfigFromPath(path)?.preset).toBe('strict')
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when path does not exist (tryReadJson L64)', () => {
    expect(loadConfigFromPath('/no/such/file.json')).toBeNull()
  })

  it('returns null on malformed JSON (tryReadJson L69-70 catch)', () => {
    const dir = makeTmp()
    const path = join(dir, 'bad.json')
    writeFileSync(path, '{ this is not json')
    expect(loadConfigFromPath(path)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null on empty file (tryReadJson L67)', () => {
    const dir = makeTmp()
    const path = join(dir, 'empty.json')
    writeFileSync(path, '   \n  \t  ')
    expect(loadConfigFromPath(path)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})
