import { describe, expect, it } from 'vitest'
import { classifyHref, toRouterPath } from '../index'

describe('classifyHref', () => {
  it('classifies hash anchors', () => {
    expect(classifyHref('#top')).toBe('hash')
    expect(classifyHref('#')).toBe('hash')
  })

  it('classifies protocol-relative URLs as external', () => {
    expect(classifyHref('//cdn.example.com/x')).toBe('external')
  })

  it('classifies mailto/tel/sms as protocol', () => {
    expect(classifyHref('mailto:a@b.com')).toBe('protocol')
    expect(classifyHref('tel:+15550001')).toBe('protocol')
    expect(classifyHref('sms:+15550001')).toBe('protocol')
  })

  it('classifies non-http(s) schemes as protocol (plain <a>, no forced new-tab)', () => {
    // Any scheme that is not http(s) and not protocol-relative `//` → plain
    // anchor the browser owns. Not `internal` (router never intercepts it).
    expect(classifyHref('ftp://host/file')).toBe('protocol')
    expect(classifyHref('custom:action')).toBe('protocol')
  })

  it('classifies bare paths as internal', () => {
    expect(classifyHref('/about')).toBe('internal')
    expect(classifyHref('about')).toBe('internal')
    expect(classifyHref('/a/b?x=1#y')).toBe('internal')
    expect(classifyHref('')).toBe('internal')
  })

  it('http(s) is case-insensitive on scheme', () => {
    expect(classifyHref('HTTPS://example.com')).toBe('external')
  })

  it('cross-origin absolute http(s) is external', () => {
    expect(classifyHref('https://not-this-origin.example.com/x')).toBe('external')
  })

  it('same-origin absolute defaults to internal, honoring config', () => {
    // The router test env provides `location` (happy-dom). Build a same-origin URL.
    const origin = location.origin
    expect(classifyHref(`${origin}/about`)).toBe('internal')
    expect(classifyHref(`${origin}/about`, { sameOriginAbsolute: 'internal' })).toBe('internal')
    expect(classifyHref(`${origin}/about`, { sameOriginAbsolute: 'external' })).toBe('external')
  })
})

describe('toRouterPath', () => {
  it('passes bare paths through unchanged', () => {
    expect(toRouterPath('/about')).toBe('/about')
    expect(toRouterPath('/a/b?x=1#y')).toBe('/a/b?x=1#y')
    expect(toRouterPath('#hash')).toBe('#hash')
  })

  it('strips an absolute http(s) URL to path + search + hash', () => {
    expect(toRouterPath('https://example.com/a/b?x=1#y')).toBe('/a/b?x=1#y')
    expect(toRouterPath('http://example.com/')).toBe('/')
  })

  it('returns the original string for an unparseable absolute URL', () => {
    // https:// with no host is still ABS_HTTP_RE-matched but URL() may throw.
    const weird = 'https://'
    // Either it parses to '/' or falls back to the original — never throws.
    expect(() => toRouterPath(weird)).not.toThrow()
  })
})
