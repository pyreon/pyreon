import { describe, expect, it } from 'vitest'
import { ADAPTERS } from '../adapters'
import type { AdapterId, ProjectConfig } from '../templates'

const cfg: ProjectConfig = {
  name: 'demo',
  targetDir: '/tmp/demo',
  template: 'spa',
  renderMode: 'spa',
  packageManager: 'bun',
  adapter: 'static',
  features: { router: true },
  initGit: false,
  installDeps: false,
} as unknown as ProjectConfig

// Coverage for badge() + envKeys() on each adapter (L48-114). The
// scaffold's snapshot test exercises the apply() side; these two
// methods are read by the post-scaffold README + .env generation and
// were previously uncovered.

const ALL: AdapterId[] = ['vercel', 'cloudflare', 'netlify', 'node', 'bun', 'static']

describe('ADAPTERS — badge() + envKeys() shape', () => {
  for (const id of ALL) {
    it(`${id} adapter exposes badge() returning a string`, () => {
      const a = ADAPTERS[id]
      expect(typeof a.badge(cfg)).toBe('string')
    })

    it(`${id} adapter exposes envKeys() returning a string array`, () => {
      const a = ADAPTERS[id]
      const keys = a.envKeys(cfg)
      expect(Array.isArray(keys)).toBe(true)
      for (const k of keys) expect(typeof k).toBe('string')
    })
  }

  it('vercel/cloudflare/netlify expose Deploy buttons', () => {
    expect(ADAPTERS.vercel.badge(cfg)).toContain('vercel.com')
    expect(ADAPTERS.cloudflare.badge(cfg)).toContain('cloudflare')
    expect(ADAPTERS.netlify.badge(cfg)).toContain('netlify')
  })

  it('node + bun adapters declare PORT env key', () => {
    expect(ADAPTERS.node.envKeys(cfg)).toContain('PORT')
    expect(ADAPTERS.bun.envKeys(cfg)).toContain('PORT')
  })

  it('static adapter has empty envKeys + no badge', () => {
    expect(ADAPTERS.static.envKeys(cfg)).toEqual([])
    expect(ADAPTERS.static.badge(cfg)).toBe('')
  })
})
