import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config/loader'
import { buildInitConfig, detectPreset, detectPyreonDeps, initConfig } from '../init'

/**
 * `--init` exists because adoption otherwise meant hand-writing config against
 * documentation — the step where a tool loses people.
 */

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function project(pkg: Record<string, unknown> | null): string {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-init-'))
  if (pkg) writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
  return dir
}

describe('detectPreset', () => {
  it('a private package is an app', () => {
    expect(detectPreset({ private: true, main: './x.js' })).toBe('app')
  })

  it('a package with an entry point is a library', () => {
    expect(detectPreset({ name: 'x', main: './dist/index.js' })).toBe('lib')
    expect(detectPreset({ name: 'x', exports: {} })).toBe('lib')
    expect(detectPreset({ name: 'x', module: './dist/index.mjs' })).toBe('lib')
  })

  it('no entry point is an app', () => {
    expect(detectPreset({ name: 'x' })).toBe('app')
  })

  it('falls back to recommended with no package.json', () => {
    expect(detectPreset(null)).toBe('recommended')
  })
})

describe('detectPyreonDeps', () => {
  it('collects @pyreon deps from both fields, sorted', () => {
    expect(
      detectPyreonDeps({
        dependencies: { '@pyreon/query': '*', react: '*' },
        devDependencies: { '@pyreon/core': '*' },
      }),
    ).toEqual(['@pyreon/core', '@pyreon/query'])
  })

  it('is empty for a project with none', () => {
    expect(detectPyreonDeps({ dependencies: { react: '*' } })).toEqual([])
  })
})

describe('buildInitConfig', () => {
  it('writes only a schema reference and a preset', () => {
    // Scaffolding every rule would FREEZE today's defaults into the user's
    // file, so a later improvement to `recommended` would never reach them.
    const parsed = JSON.parse(buildInitConfig('app'))
    expect(Object.keys(parsed).sort()).toEqual(['$schema', 'preset'])
    expect(parsed.preset).toBe('app')
    expect(parsed.$schema).toContain('pyreonlintrc.schema.json')
  })

  it('produces valid JSON ending in a newline', () => {
    const out = buildInitConfig('lib')
    expect(out.endsWith('\n')).toBe(true)
    expect(() => JSON.parse(out)).not.toThrow()
  })
})

describe('initConfig', () => {
  it('writes a config the loader can actually read back', () => {
    // The round trip is the point: a scaffold the tool cannot load is worse
    // than none, because the failure surfaces later and elsewhere.
    const cwd = project({ name: 'app', private: true })
    const r = initConfig(cwd)
    expect(r.status).toBe('written')
    expect(r.preset).toBe('app')
    const loaded = loadConfig(cwd)
    expect(loaded?.preset).toBe('app')
  })

  it('picks lib for a published package', () => {
    const cwd = project({ name: 'lib', main: './dist/index.js' })
    expect(initConfig(cwd).preset).toBe('lib')
  })

  it('REFUSES to overwrite an existing config', () => {
    const cwd = project({ name: 'app', private: true })
    const path = join(cwd, '.pyreonlintrc.json')
    writeFileSync(path, '{"preset":"strict"}')
    const r = initConfig(cwd)
    expect(r.status).toBe('exists')
    // The hand-tuned file is untouched — clobbering it is the one
    // unrecoverable thing this command could do.
    expect(readFileSync(path, 'utf-8')).toBe('{"preset":"strict"}')
  })

  it('explains itself instead of guessing with no package.json', () => {
    const cwd = project(null)
    const r = initConfig(cwd)
    expect(r.status).toBe('no-package-json')
    expect(r.message).toContain('package.json')
  })

  it('names the libraries whose rules will activate', () => {
    const cwd = project({ name: 'app', private: true, dependencies: { '@pyreon/query': '*' } })
    expect(initConfig(cwd).message).toContain('@pyreon/query')
  })

  it('says so when there are no Pyreon deps yet', () => {
    const cwd = project({ name: 'app', private: true })
    expect(initConfig(cwd).message).toContain('stay silent')
  })

  it('refuses via an ATOMIC create, not a check-then-write race', async () => {
    // Static guard. `existsSync(path)` followed by a later `writeFileSync` is
    // `js/file-system-race` — CodeQL flagged exactly this here, and it is a
    // class this repo has hit before. The invariant belongs in the syscall
    // (`flag: 'wx'`), so the file cannot appear between check and write.
    const { readFileSync: rf } = await import('node:fs')
    const { join: j } = await import('node:path')
    const src = rf(j(import.meta.dirname, '..', 'init.ts'), 'utf-8')
    const code = src.replace(/\/\*\*[\s\S]*?\*\//g, '') // strip doc comments
    expect(code).not.toContain('existsSync')
    expect(code).toContain("flag: 'wx'")
  })

  it('points at --why-off, the answer to the next question a user has', () => {
    const cwd = project({ name: 'app', private: true })
    expect(initConfig(cwd).message).toContain('--why-off')
  })
})
