/**
 * `.url()` and its `protocol` option.
 *
 * The default stays `http:` / `https:` -- deliberately, see `UrlOpts`: widening
 * it would start admitting `javascript:` and `data:` in apps that relied on
 * `.url()` to keep them out of rendered links. `protocol` opts into any
 * RFC 3986 absolute URI whose scheme matches, with the meaning zod 4 gives the
 * same option.
 */
import { s } from '../index'
import * as m from '../mini'
import { installFormatValidator, uninstallFormatValidator } from '../core/registry'
import { uriWithProtocol } from '../primitives/string'

const ok = (schema: { parse(v: unknown): { ok: boolean } }, v: unknown): boolean => schema.parse(v).ok
const ANY = /^[a-z][a-z0-9+.-]*$/i

describe('.url() default is unchanged: http(s) with a host', () => {
  it.each(['https://x.io', 'http://a.b/c?d=1'])('accepts %s', (v) => {
    expect(ok(s.string().url(), v)).toBe(true)
  })
  it.each(['javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.co', 'ftp://x', 'nope', ''])('rejects %s', (v) => {
    expect(ok(s.string().url(), v)).toBe(false)
  })
})

describe('.url({ protocol })', () => {
  const any = () => s.string().url({ protocol: ANY })

  it.each([
    'git:git.example.com/octocat/Hello-World.git',
    'mailto:a@b.co',
    'urn:isbn:0451450523',
    'ssh://git@github.com/a/b',
    'https://x.io/a',
    'about:',
  ])('any scheme accepts the absolute URI %s', (v) => {
    expect(ok(any(), v)).toBe(true)
  })

  it.each(['/relative/path', 'not a uri', '', '1http://x', 'https://x y', ':nope'])(
    'still rejects the non-URI %j',
    (v) => {
      expect(ok(any(), v)).toBe(false)
    },
  )

  it('tests the SCHEME, without the colon, like zod', () => {
    const web = s.string().url({ protocol: /^https?$/ })
    expect(ok(web, 'https://x.io')).toBe(true)
    expect(ok(web, 'mailto:a@b.co')).toBe(false)
    const mail = s.string().url({ protocol: /^(https|mailto)$/ })
    expect(ok(mail, 'mailto:a@b.co')).toBe(true)
    expect(ok(mail, 'javascript:alert(1)')).toBe(false)
  })

  it('a GLOBAL protocol regex gives the same verdict on every call', () => {
    // `lastIndex` would otherwise make every second test of the same value fail.
    // Asserted on the predicate itself: the schema's parse path happens to
    // mask it today, and that is not a property to lean on.
    const pred = uriWithProtocol(/^https$/g)
    expect([1, 2, 3, 4].map(() => pred('https://x.io'))).toEqual([true, true, true, true])
  })

  it('reports the protocol in the issue params', () => {
    const r = s.string().url({ protocol: /^https$/ }).safeParse('ftp://x')
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).toContain('^https$')
  })

  it('agrees with the mini action, the JIT and the interpreter', () => {
    const mini = m.string().check(m.url({ protocol: ANY }))
    for (const v of ['mailto:a@b.co', 'nope', 'git:x/y', '', 5]) {
      expect(mini.parse(v).ok, String(v)).toBe(any().parse(v).ok)
    }
  })

  it('an installed `uri` validator is honoured, and cannot widen the allowed schemes', () => {
    // A server may install a stricter URI parser; the scheme filter still
    // applies on top of whatever it accepts.
    installFormatValidator('uri', (v) => !v.includes('evil'))
    try {
      expect(ok(s.string().url({ protocol: ANY }), 'https://evil.io')).toBe(false)
      expect(ok(s.string().url({ protocol: ANY }), 'https://good.io')).toBe(true)
      expect(ok(s.string().url({ protocol: /^https$/ }), 'ftp://good.io')).toBe(false)
    } finally {
      uninstallFormatValidator('uri')
    }
  })

  it('an installed `url` validator does not change the protocol form', () => {
    installFormatValidator('url', () => false)
    try {
      expect(ok(s.string().url({ protocol: ANY }), 'mailto:a@b.co')).toBe(true)
      expect(ok(s.string().url(), 'https://x.io')).toBe(false)
    } finally {
      uninstallFormatValidator('url')
    }
  })
})
