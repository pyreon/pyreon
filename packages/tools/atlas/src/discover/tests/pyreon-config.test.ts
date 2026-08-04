/**
 * Reading Atlas's settings from the ecosystem-wide `pyreon.config.ts`.
 *
 * The precedence rule is the interesting part: a project that has BOTH files
 * has almost certainly just started migrating, and letting the general file
 * silently override the specific one mid-migration is the worst available
 * ordering — the settings you are still editing stop taking effect, with
 * nothing to say why.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONFIG_FILENAMES } from '@pyreon/config'
import { loadAtlasConfig } from '../config'
import type { ModuleLoader } from '../load'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-cfg-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** A loader returning canned modules, so nothing here needs a real transpile. */
const loaderFor = (modules: Record<string, Record<string, unknown>>): ModuleLoader => ({
  kind: 'runtime',
  load: async (file: string) => {
    const key = Object.keys(modules).find((name) => file.endsWith(name))
    if (!key) throw new Error(`no stub for ${file}`)
    return modules[key]!
  },
  close: async () => {},
})

const write = (name: string): void => writeFileSync(join(root, name), '// stub\n', 'utf8')

describe('pyreon.config.ts', () => {
  // Drift lock. The filename list and the section reader live in
  // `@pyreon/config`; this loader used to restate both. A second copy is a
  // config that is silently ignored the day the lists disagree — the exact
  // failure the shared file exists to reduce. Iterating the SHARED constant
  // means a filename added there is covered here without anyone remembering to.
  it.each([...CONFIG_FILENAMES])('discovers %s from the shared filename list', async (name) => {
    write(name)
    const loaded = await loadAtlasConfig(
      root,
      loaderFor({ [name]: { default: { atlas: { title: `via ${name}` } } } }),
    )
    expect(loaded.config.title).toBe(`via ${name}`)
    expect(loaded.path).toBe(join(root, name))
  })

  it('reads the atlas section from a default export', async () => {
    write('pyreon.config.ts')
    const loaded = await loadAtlasConfig(
      root,
      loaderFor({ 'pyreon.config.ts': { default: { atlas: { title: 'Shared' } } } }),
    )
    expect(loaded.config.title).toBe('Shared')
  })

  it('reads the atlas section from a NAMED export', async () => {
    write('pyreon.config.ts')
    const loaded = await loadAtlasConfig(
      root,
      loaderFor({ 'pyreon.config.ts': { atlas: { title: 'Named' } } }),
    )
    expect(loaded.config.title).toBe('Named')
  })

  it('carries the whole section through, not just the title', async () => {
    write('pyreon.config.ts')
    const loaded = await loadAtlasConfig(
      root,
      loaderFor({
        'pyreon.config.ts': {
          default: {
            atlas: {
              title: 'Acme',
              projects: [{ name: 'Core', dir: 'packages/core/src' }],
              pages: { Button: { title: 'CTA' } },
            },
          },
        },
      }),
    )
    expect(loaded.config.projects).toEqual([{ name: 'Core', dir: 'packages/core/src' }])
    expect(loaded.config.pages).toEqual({ Button: { title: 'CTA' } })
  })

  it('is SILENT when the file exists with no atlas key', async () => {
    // A project configuring some other tool has done nothing wrong.
    write('pyreon.config.ts')
    const loaded = await loadAtlasConfig(
      root,
      loaderFor({ 'pyreon.config.ts': { default: { lint: {} } } }),
    )
    expect(loaded.config).toEqual({})
    expect(loaded.error).toBeUndefined()
  })

  it('NAMES a malformed atlas key rather than ignoring it', async () => {
    write('pyreon.config.ts')
    const loaded = await loadAtlasConfig(
      root,
      loaderFor({ 'pyreon.config.ts': { default: { atlas: 'nope' } } }),
    )
    expect(loaded.error).toContain('`atlas` must be an object')
  })

  it('still validates the section — a bad field is named, the rest applies', async () => {
    write('pyreon.config.ts')
    const loaded = await loadAtlasConfig(
      root,
      loaderFor({ 'pyreon.config.ts': { default: { atlas: { title: 'Ok', pages: 'bad' } } } }),
    )
    expect(loaded.config.title).toBe('Ok')
    expect(loaded.error).toContain('`pages` ignored')
  })
})

describe('precedence', () => {
  it('the per-tool file WINS when both exist', async () => {
    write('atlas.config.ts')
    write('pyreon.config.ts')
    const loaded = await loadAtlasConfig(
      root,
      loaderFor({
        'atlas.config.ts': { default: { title: 'Specific' } },
        'pyreon.config.ts': { default: { atlas: { title: 'General' } } },
      }),
    )
    expect(loaded.config.title).toBe('Specific')
  })

  it('an unchanged single-file project reads exactly as before', async () => {
    write('atlas.config.ts')
    const loaded = await loadAtlasConfig(
      root,
      loaderFor({ 'atlas.config.ts': { default: { title: 'Only' } } }),
    )
    expect(loaded.config.title).toBe('Only')
    expect(loaded.path).toContain('atlas.config.ts')
  })

  it('no config at all is still no error', async () => {
    const loaded = await loadAtlasConfig(root, loaderFor({}))
    expect(loaded).toEqual({ config: {} })
  })
})
