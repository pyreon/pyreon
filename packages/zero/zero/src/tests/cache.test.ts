import { describe, expect, it } from 'vitest'
import { cacheMiddleware, matchGlob } from '../cache'

describe('cache header logic', () => {
  const HASHED_ASSET = /\.[a-f0-9]{8,}\.\w+$/
  const STATIC_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|wav)$/i
  const SCRIPT_EXT = /\.(js|css|mjs)$/i

  it('detects hashed assets', () => {
    // Vite uses dot-separated hashes: app.a1b2c3d4.js
    expect(HASHED_ASSET.test('/assets/app.a1b2c3d4.js')).toBe(true)
    expect(HASHED_ASSET.test('/assets/style.deadbeef01.css')).toBe(true)
    expect(HASHED_ASSET.test('/assets/app.js')).toBe(false)
    expect(HASHED_ASSET.test('/index.html')).toBe(false)
  })

  it('detects static assets', () => {
    expect(STATIC_EXT.test('/img/hero.png')).toBe(true)
    expect(STATIC_EXT.test('/fonts/inter.woff2')).toBe(true)
    expect(STATIC_EXT.test('/video.mp4')).toBe(true)
    expect(STATIC_EXT.test('/favicon.ico')).toBe(true)
    expect(STATIC_EXT.test('/app.js')).toBe(false)
    expect(STATIC_EXT.test('/index.html')).toBe(false)
  })

  it('detects script assets', () => {
    expect(SCRIPT_EXT.test('/app.js')).toBe(true)
    expect(SCRIPT_EXT.test('/style.css')).toBe(true)
    expect(SCRIPT_EXT.test('/module.mjs')).toBe(true)
    expect(SCRIPT_EXT.test('/image.png')).toBe(false)
  })

  it('determines correct cache strategy', () => {
    function getCacheStrategy(path: string): string {
      if (HASHED_ASSET.test(path)) return 'immutable'
      if (SCRIPT_EXT.test(path)) return 'short-cache'
      if (STATIC_EXT.test(path)) return 'long-cache'
      return 'no-cache'
    }

    expect(getCacheStrategy('/assets/app.a1b2c3d4.js')).toBe('immutable')
    expect(getCacheStrategy('/assets/style.css')).toBe('short-cache')
    expect(getCacheStrategy('/img/hero.webp')).toBe('long-cache')
    expect(getCacheStrategy('/')).toBe('no-cache')
    expect(getCacheStrategy('/about')).toBe('no-cache')
  })
})

describe('matchGlob', () => {
  it('matches simple wildcard patterns', () => {
    expect(matchGlob('/api/*', '/api/users')).toBe(true)
    expect(matchGlob('/api/*', '/api/users/123')).toBe(true)
    expect(matchGlob('/api/*', '/about')).toBe(false)
  })

  it('matches exact paths', () => {
    expect(matchGlob('/about', '/about')).toBe(true)
    expect(matchGlob('/about', '/about/team')).toBe(false)
    expect(matchGlob('/about', '/')).toBe(false)
  })

  it('matches single-character wildcards', () => {
    expect(matchGlob('/user?', '/user1')).toBe(true)
    expect(matchGlob('/user?', '/userA')).toBe(true)
    expect(matchGlob('/user?', '/user')).toBe(false)
    expect(matchGlob('/user?', '/user12')).toBe(false)
  })

  it('handles dots in patterns (escaped properly)', () => {
    expect(matchGlob('/file.txt', '/file.txt')).toBe(true)
    expect(matchGlob('/file.txt', '/fileXtxt')).toBe(false)
  })

  it('handles multiple wildcards', () => {
    expect(matchGlob('/*/files/*', '/user/files/doc')).toBe(true)
    expect(matchGlob('/*/files/*', '/admin/files/report.pdf')).toBe(true)
  })

  it('matches root path', () => {
    expect(matchGlob('/', '/')).toBe(true)
    expect(matchGlob('/', '/about')).toBe(false)
  })

  it('handles patterns with special regex characters', () => {
    expect(matchGlob('/api/v1+v2', '/api/v1+v2')).toBe(true)
    expect(matchGlob('/api/v1+v2', '/api/v11v2')).toBe(false)
    expect(matchGlob('/path(1)', '/path(1)')).toBe(true)
    expect(matchGlob('/price$10', '/price$10')).toBe(true)
  })

  it('handles patterns with brackets', () => {
    expect(matchGlob('/api/[id]', '/api/[id]')).toBe(true)
    expect(matchGlob('/api/[id]', '/api/123')).toBe(false)
  })
})

describe('cacheMiddleware — personalized pages are never public', () => {
  it('a page for a credentialed request gets private, no-cache', async () => {
    const mw = cacheMiddleware({ pages: 60 })
    const ctx = (headers: Record<string, string>) => {
      const url = new URL('http://localhost/account')
      return { req: new Request(url, { headers }), url, path: '/account', headers: new Headers(), locals: {} }
    }
    const anon = ctx({})
    await mw(anon)
    expect(anon.headers.get('Cache-Control')).toContain('public')
    const withCookie = ctx({ cookie: 'sid=1' })
    await mw(withCookie)
    expect(withCookie.headers.get('Cache-Control')).toBe('private, no-cache')
    const withAuth = ctx({ authorization: 'Bearer x' })
    await mw(withAuth)
    expect(withAuth.headers.get('Cache-Control')).toBe('private, no-cache')
  })

  it('assets stay public for credentialed requests', async () => {
    const mw = cacheMiddleware({ pages: 60 })
    const url = new URL('http://localhost/assets/app.abc12345ef.js')
    const c = { req: new Request(url, { headers: { cookie: 'sid=1' } }), url, path: url.pathname, headers: new Headers(), locals: {} }
    await mw(c)
    expect(c.headers.get('Cache-Control')).toContain('public')
  })
})
