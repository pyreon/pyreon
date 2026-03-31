import { describe, expect, it } from 'vitest'
import { buildCspHeader, cspMiddleware } from '../csp'

describe('buildCspHeader', () => {
  it('builds basic directives', () => {
    const header = buildCspHeader({
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.example.com'],
    })
    expect(header).toBe("default-src 'self'; script-src 'self' https://cdn.example.com")
  })

  it('handles nonce replacement', () => {
    const header = buildCspHeader(
      { scriptSrc: ["'self'", "'nonce'"] },
      'abc123',
    )
    expect(header).toBe("script-src 'self' 'nonce-abc123'")
  })

  it('strips nonce placeholder when no nonce provided', () => {
    const header = buildCspHeader({ scriptSrc: ["'self'", "'nonce'"] })
    expect(header).toBe("script-src 'self'")
  })

  it('includes upgrade-insecure-requests', () => {
    const header = buildCspHeader({
      defaultSrc: ["'self'"],
      upgradeInsecureRequests: true,
    })
    expect(header).toContain('upgrade-insecure-requests')
  })

  it('includes block-all-mixed-content', () => {
    const header = buildCspHeader({
      defaultSrc: ["'self'"],
      blockAllMixedContent: true,
    })
    expect(header).toContain('block-all-mixed-content')
  })

  it('handles all directive types', () => {
    const header = buildCspHeader({
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    })
    expect(header).toContain("default-src 'self'")
    expect(header).toContain("img-src 'self' data: https:")
    expect(header).toContain('font-src')
    expect(header).toContain('connect-src')
    expect(header).toContain('frame-src')
    expect(header).toContain('object-src')
    expect(header).toContain('base-uri')
  })

  it('skips undefined directives', () => {
    const header = buildCspHeader({ defaultSrc: ["'self'"] })
    expect(header).toBe("default-src 'self'")
    expect(header).not.toContain('script-src')
  })

  it('includes report-uri', () => {
    const header = buildCspHeader({
      defaultSrc: ["'self'"],
      reportUri: '/csp-report',
    })
    expect(header).toContain('report-uri /csp-report')
  })
})

describe('cspMiddleware', () => {
  it('returns a middleware function', () => {
    const mw = cspMiddleware({
      directives: { defaultSrc: ["'self'"] },
    })
    expect(typeof mw).toBe('function')
  })

  it('sets Content-Security-Policy header', () => {
    const mw = cspMiddleware({
      directives: { defaultSrc: ["'self'"] },
    })
    const headers = new Headers()
    mw({ headers, locals: {} } as any)
    expect(headers.get('Content-Security-Policy')).toBe("default-src 'self'")
  })

  it('sets Report-Only header when configured', () => {
    const mw = cspMiddleware({
      directives: { defaultSrc: ["'self'"] },
      reportOnly: true,
    })
    const headers = new Headers()
    mw({ headers, locals: {} } as any)
    expect(headers.get('Content-Security-Policy-Report-Only')).toBe("default-src 'self'")
    expect(headers.get('Content-Security-Policy')).toBeNull()
  })

  it('generates nonce and attaches to locals', () => {
    const mw = cspMiddleware({
      directives: { scriptSrc: ["'self'", "'nonce'"] },
    })
    const headers = new Headers()
    const locals: Record<string, unknown> = {}
    mw({ headers, locals } as any)
    expect(locals.cspNonce).toBeDefined()
    expect(typeof locals.cspNonce).toBe('string')
    expect(headers.get('Content-Security-Policy')).toContain("'nonce-")
  })
})
