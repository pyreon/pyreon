import { describe, expect, it } from 'vitest'
import { applyPathParams, buildQuery, buildUrl, isAbsoluteUrl, joinUrl } from '../url'

describe('isAbsoluteUrl', () => {
  it('recognises schemes', () => {
    expect(isAbsoluteUrl('https://a.com/x')).toBe(true)
    expect(isAbsoluteUrl('http://a.com')).toBe(true)
    expect(isAbsoluteUrl('/api/users')).toBe(false)
    expect(isAbsoluteUrl('users')).toBe(false)
  })
})

describe('joinUrl', () => {
  it('inserts exactly one slash regardless of the input shapes', () => {
    expect(joinUrl('/api', 'users')).toBe('/api/users')
    expect(joinUrl('/api', '/users')).toBe('/api/users')
    expect(joinUrl('/api/', 'users')).toBe('/api/users')
    expect(joinUrl('/api/', '/users')).toBe('/api/users')
  })

  it('treats baseUrl as a PREFIX, not a WHATWG base', () => {
    // `new URL('/users', 'https://api.com/v1')` would give `…/users`.
    // A leading slash must NOT discard the base path, because that would
    // make the same path behave differently under a relative base.
    expect(joinUrl('https://api.com/v1', '/users')).toBe('https://api.com/v1/users')
    expect(joinUrl('/api/v1', '/users')).toBe('/api/v1/users')
  })

  it('lets an absolute path win and tolerates no base', () => {
    expect(joinUrl('/api', 'https://other.com/x')).toBe('https://other.com/x')
    expect(joinUrl(undefined, '/users')).toBe('/users')
    expect(joinUrl('', '/users')).toBe('/users')
  })
})

describe('applyPathParams', () => {
  it('substitutes and URL-encodes', () => {
    expect(applyPathParams('/users/:id', { id: 42 })).toBe('/users/42')
    expect(applyPathParams('/u/:a/p/:b', { a: '1', b: '2' })).toBe('/u/1/p/2')
  })

  it('encodes a value that would otherwise break out of its segment', () => {
    expect(applyPathParams('/users/:id', { id: 'a/b?c' })).toBe('/users/a%2Fb%3Fc')
  })

  it('throws — rather than leaving a literal ":id" — when a param is missing', () => {
    expect(() => applyPathParams('/users/:id', {})).toThrow(/needs the parameter "id"/)
    expect(() => applyPathParams('/users/:id', undefined)).toThrow(/\[Pyreon\]/)
  })

  it('is a no-op for a path with no placeholders', () => {
    expect(applyPathParams('/users', { id: 1 })).toBe('/users')
  })
})

describe('buildQuery', () => {
  it('drops undefined and null instead of stringifying them', () => {
    // The classic hand-rolled bug: `?q=undefined`.
    expect(buildQuery({ a: 1, b: undefined, c: null, d: 'x' })).toBe('?a=1&d=x')
  })

  it('repeats the key for arrays and skips nullish members', () => {
    expect(buildQuery({ tag: ['a', 'b'] })).toBe('?tag=a&tag=b')
  })

  it('keeps falsy-but-real values', () => {
    expect(buildQuery({ page: 0, active: false })).toBe('?page=0&active=false')
  })

  it('returns an empty string for nothing to serialize', () => {
    expect(buildQuery(undefined)).toBe('')
    expect(buildQuery({})).toBe('')
    expect(buildQuery({ a: undefined })).toBe('')
  })
})

describe('buildUrl', () => {
  it('composes base + path + params + query', () => {
    expect(buildUrl('/api', '/users/:id', { id: 7 }, { full: true })).toBe(
      '/api/users/7?full=true',
    )
  })

  it('appends with & when the path already carries a query string', () => {
    expect(buildUrl('/api', '/search?q=a', undefined, { page: 2 })).toBe('/api/search?q=a&page=2')
  })

  it('omits the separator when there is nothing to append', () => {
    expect(buildUrl('/api', '/users', undefined, undefined)).toBe('/api/users')
  })
})

describe('literal colon escape', () => {
  it('`\\:` is a literal colon, not a second parameter', () => {
    expect(applyPathParams('/v1/:name\\:cancel', { name: 'ops/1' })).toBe('/v1/ops%2F1:cancel')
    expect(applyPathParams('/v1/projects\\:list', undefined)).toBe('/v1/projects:list')
    expect(buildUrl('https://api.test', '/v1/:a\\:b/:c', { a: 'x', c: 'y' }, { q: 1 })).toBe(
      'https://api.test/v1/x:b/y?q=1',
    )
  })

  it('an unescaped colon mid-segment is still a parameter, as the type says', () => {
    expect(() => applyPathParams('/v1/:name:cancel', { name: 'x' })).toThrow(/needs the parameter "cancel"/)
  })
})

describe('query styles', () => {
  const dec = (qs: string): string => decodeURIComponent(qs.replace(/\+/g, ' '))

  it('an object defaults to bracket keys instead of [object Object]', () => {
    expect(dec(buildQuery({ filter: { status: 'open', n: 2, gone: undefined } }))).toBe(
      '?filter[status]=open&filter[n]=2',
    )
  })

  it('form + explode:false joins an array with commas', () => {
    expect(dec(buildQuery({ ids: [1, 2] }, { ids: { style: 'form', explode: false } }))).toBe('?ids=1,2')
  })

  it('space- and pipe-delimited', () => {
    expect(dec(buildQuery({ t: ['a', 'b'] }, { t: { style: 'spaceDelimited', explode: false } }))).toBe('?t=a b')
    expect(dec(buildQuery({ t: ['a', 'b'] }, { t: { style: 'pipeDelimited', explode: false } }))).toBe('?t=a|b')
  })

  it('exploded styles on arrays repeat the key, like the default', () => {
    expect(buildQuery({ t: ['a', 'b'] }, { t: { style: 'form' } })).toBe('?t=a&t=b')
    expect(buildQuery({ t: ['a', null as never, 'b'] }, { t: { style: 'pipeDelimited' } })).toBe('?t=a&t=b')
  })

  it('an object under form explode flattens; form non-explode lists pairs', () => {
    expect(buildQuery({ f: { a: 1, b: [2, 3] } }, { f: { style: 'form' } })).toBe('?a=1&b=2&b=3')
    expect(dec(buildQuery({ f: { a: 1, b: 'x' } }, { f: { style: 'form', explode: false } }))).toBe('?f=a,1,b,x')
    expect(dec(buildQuery({ f: { a: [1, 2] } }, { f: { style: 'deepObject' } }))).toBe('?f[a]=1&f[a]=2')
  })

  it('an empty collection under a joining style emits nothing', () => {
    expect(buildQuery({ ids: [] }, { ids: { style: 'form', explode: false } })).toBe('')
    expect(buildQuery({ f: {} }, { f: { style: 'form', explode: false } })).toBe('')
  })

  it('buildUrl threads the styles through', () => {
    expect(dec(buildUrl('https://a.test', '/x', undefined, { ids: [1, 2] }, { ids: { style: 'form', explode: false } }))).toBe(
      'https://a.test/x?ids=1,2',
    )
  })
})
