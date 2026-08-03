/**
 * `@pyreon/config` — the routing table for `pyreon.config.ts`.
 *
 * Small on purpose: the tool that reads a section owns what it means, so
 * nothing here validates Atlas's fields (Atlas does) or Lint's (Lint will).
 * What this owns is finding the section at all, and doing it the same way for
 * every tool — because "my config is silently ignored" is the failure a single
 * config file exists to reduce, not to multiply.
 */
import { describe, expect, it } from 'vitest'
import { CONFIG_FILENAMES, defineConfig, sectionFrom } from '../index'

describe('defineConfig', () => {
  it('returns the object unchanged — it exists for the types', () => {
    const config = { atlas: { title: 'Acme' } }
    expect(defineConfig(config)).toBe(config)
  })

  it('accepts a key this version does not know about', () => {
    // Rejecting unknown keys would force the whole ecosystem to upgrade in
    // lockstep with any package that adds one.
    expect(() => defineConfig({ somethingNew: { enabled: true } })).not.toThrow()
  })
})

describe('sectionFrom', () => {
  it('reads a default export', () => {
    expect(sectionFrom({ default: { atlas: { title: 'A' } } }, 'atlas')).toEqual({ title: 'A' })
  })

  it('reads a named export', () => {
    expect(sectionFrom({ atlas: { title: 'B' } }, 'atlas')).toEqual({ title: 'B' })
  })

  it('prefers the NAMED export when both exist', () => {
    // A named export is the more specific statement of intent, and matches how
    // every existing Pyreon config loader resolves the same ambiguity.
    const module = { atlas: { title: 'named' }, default: { atlas: { title: 'default' } } }
    expect(sectionFrom(module, 'atlas')).toEqual({ title: 'named' })
  })

  it('is undefined for a tool the config says nothing about', () => {
    expect(sectionFrom({ default: { atlas: {} } }, 'lint')).toBeUndefined()
  })

  it('does not crash on a module with no default and no key', () => {
    expect(sectionFrom({}, 'atlas')).toBeUndefined()
  })
})

describe('CONFIG_FILENAMES', () => {
  it('puts .ts first — the form every example and generator writes', () => {
    expect(CONFIG_FILENAMES[0]).toBe('pyreon.config.ts')
  })

  it('covers the four extensions a config is realistically written in', () => {
    expect([...CONFIG_FILENAMES]).toEqual([
      'pyreon.config.ts',
      'pyreon.config.tsx',
      'pyreon.config.mjs',
      'pyreon.config.js',
    ])
  })
})
