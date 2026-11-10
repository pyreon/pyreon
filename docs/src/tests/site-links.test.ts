import { describe, expect, it } from 'vitest'
import { resolveSiteLink, SITE_LINKS } from '../site-links'

describe('resolveSiteLink', () => {
  it('returns null while a link is switched off', () => {
    expect(resolveSiteLink('discord', { discord: null, newsletter: null })).toBeNull()
  })

  it('returns the configured https target unchanged', () => {
    const links = { discord: 'https://discord.gg/abc123', newsletter: 'https://buttondown.com/pyreon?tag=site' }
    expect(resolveSiteLink('discord', links)).toBe('https://discord.gg/abc123')
    // A query string the CONFIG carries is kept; nothing is appended to it.
    expect(resolveSiteLink('newsletter', links)).toBe('https://buttondown.com/pyreon?tag=site')
  })

  it('fails the build on a target that is not an absolute https URL', () => {
    expect(() => resolveSiteLink('discord', { discord: 'discord.gg/abc', newsletter: null })).toThrow(/is not a URL/)
    expect(() => resolveSiteLink('discord', { discord: 'http://discord.gg/abc', newsletter: null })).toThrow(/must be an https/)
    expect(() => resolveSiteLink('discord', { discord: 'javascript:alert(1)', newsletter: null })).toThrow(/must be an https/)
  })

  it('accepts the committed config', () => {
    for (const key of Object.keys(SITE_LINKS) as (keyof typeof SITE_LINKS)[]) {
      expect(() => resolveSiteLink(key)).not.toThrow()
    }
  })
})
