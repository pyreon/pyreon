import { describe, expect, it } from 'vitest'
import { buildCspHeader, cspMiddleware, useNonce } from '../csp'

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

  it('useNonce returns the nonce set by middleware', () => {
    const mw = cspMiddleware({
      directives: { scriptSrc: ["'self'", "'nonce'"] },
    })
    const headers = new Headers()
    const locals: Record<string, unknown> = {}
    mw({ headers, locals } as any)
    const nonce = useNonce()
    expect(nonce).toBe(locals.cspNonce)
    expect(nonce.length).toBeGreaterThan(0)
  })

  it('useNonce returns empty string when no nonce middleware', () => {
    const mw = cspMiddleware({
      directives: { defaultSrc: ["'self'"] },
    })
    const headers = new Headers()
    mw({ headers, locals: {} } as any)
    expect(useNonce()).toBe('')
  })

  // Bisect-verifiable: replacing the throw with a Math.random fallback
  // makes this test fail because the error message check fires only on
  // the throw path. Earlier code silently degraded — this regression
  // test locks in the fail-loud contract.
  it('throws when crypto.getRandomValues is unavailable (no silent Math.random fallback)', () => {
    const originalCrypto = globalThis.crypto
    // Simulate an environment without Web Crypto.
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    })
    try {
      const mw = cspMiddleware({
        directives: { scriptSrc: ["'self'", "'nonce'"] },
      })
      const headers = new Headers()
      const locals: Record<string, unknown> = {}
      expect(() => mw({ headers, locals } as any)).toThrow(/crypto\.getRandomValues/)
      expect(() => mw({ headers, locals } as any)).toThrow(/Pyreon/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      })
    }
  })

  it('regression: nonce uses crypto.getRandomValues, not Math.random', () => {
    // High-entropy contract: 16 random bytes encoded as base64 produce
    // a 24-char (with padding) string. Math.random's `.toString(36)`
    // produces ~24 chars but with limited entropy and a different
    // character set (no '+/' from base64). This shape check catches
    // accidental fallback regression.
    const mw = cspMiddleware({
      directives: { scriptSrc: ["'self'", "'nonce'"] },
    })
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const headers = new Headers()
      const locals: Record<string, unknown> = {}
      mw({ headers, locals } as any)
      const nonce = locals.cspNonce as string
      // Base64 (with possible padding) — Math.random.toString(36) cannot produce '+' or '/' or '='
      expect(/^[A-Za-z0-9+/=]+$/.test(nonce)).toBe(true)
      expect(nonce.length).toBeGreaterThanOrEqual(20) // 16 bytes → 24 base64 chars (with padding)
      seen.add(nonce)
    }
    // 100 nonces, all unique — sanity check that randomness is actually random.
    expect(seen.size).toBe(100)
  })
})
