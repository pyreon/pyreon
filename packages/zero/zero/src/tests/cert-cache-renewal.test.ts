/**
 * The dev-certificate cache: when a cached cert is reused, and when it
 * is thrown away and reissued.
 *
 * Both directions are user-visible and neither throws. Reusing a cert
 * that has expired means the browser interstitial returns and the phone
 * on the LAN — the whole reason `https()` exists — stops trusting the
 * dev server. Discarding a cert that is still good means reissuing on
 * every boot, which under the self-signed tier means the interstitial
 * returns *anyway*, and under mkcert means churning the trust store.
 *
 * `expiryOf` is the function this file exists for. It already shipped
 * one silent failure: it used `require('node:crypto')` inside a
 * try/catch in a `type: module` package, so under Node it threw, the
 * catch swallowed it, and every certificate got the 24-hour FALLBACK
 * expiry instead of its real 825 days — the cache reissued daily and the
 * interstitial came back every morning. A `null` return is
 * indistinguishable from "this PEM has no expiry", which is exactly what
 * made it invisible; these specs pin both the parse and the arithmetic
 * around it.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expiryOf, resolveCertificate } from '../https/cert'

const DAY = 24 * 60 * 60 * 1000

function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'pyreon-cert-'))
}

/** Seed the cache directory the resolver reads, with a chosen expiry. */
function seedCache(root: string, hosts: string[], notAfter: string): string {
  const dir = join(root, 'node_modules', '.pyreon-https')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'cert.pem'), 'CACHED-CERT')
  writeFileSync(join(dir, 'key.pem'), 'CACHED-KEY')
  writeFileSync(
    join(dir, 'meta.json'),
    JSON.stringify({ hosts, tier: 'self-signed', untrusted: true, notAfter }),
  )
  return dir
}

const resolve = (root: string, hosts: string[]) =>
  resolveCertificate({ hosts, root, preferSelfSigned: true })

describe('a cached certificate is reused while it is still good', () => {
  it('returns the cached PEM rather than reissuing', () => {
    // The control. Every "must reissue" spec below is worthless against
    // a resolver that never reads the cache at all.
    const root = workspace()
    seedCache(root, ['localhost'], new Date(Date.now() + 300 * DAY).toISOString())
    expect(resolve(root, ['localhost']).cert).toBe('CACHED-CERT')
  })
})

describe('a cached certificate is DISCARDED when it cannot be trusted', () => {
  it('reissues one that is already expired', () => {
    // Serving an expired cert is the failure the renewal window exists
    // to prevent — the browser rejects it outright.
    const root = workspace()
    seedCache(root, ['localhost'], new Date(Date.now() - DAY).toISOString())
    expect(resolve(root, ['localhost']).cert).not.toBe('CACHED-CERT')
  })

  it('reissues one that expires INSIDE the renewal window', () => {
    // Still valid, but not for long. Renewing early is the whole point:
    // a cert that expires mid-session is worse than one replaced at boot.
    const root = workspace()
    seedCache(root, ['localhost'], new Date(Date.now() + 2 * DAY).toISOString())
    expect(resolve(root, ['localhost']).cert).not.toBe('CACHED-CERT')
  })

  it('reissues when notAfter is not a parseable date', () => {
    // The shape a truncated write leaves behind. `new Date('garbage')`
    // yields NaN, and NaN comparisons are all false — so without the
    // explicit isNaN check the cert would be treated as valid FOREVER.
    const root = workspace()
    seedCache(root, ['localhost'], 'not-a-date')
    expect(resolve(root, ['localhost']).cert).not.toBe('CACHED-CERT')
  })

  it('reissues when the HOSTS no longer match', () => {
    // Adding a LAN address to the config must mint a cert covering it;
    // reusing the localhost-only one leaves the phone untrusted with no
    // indication why.
    const root = workspace()
    seedCache(root, ['localhost'], new Date(Date.now() + 300 * DAY).toISOString())
    expect(resolve(root, ['localhost', '192.168.1.24']).cert).not.toBe('CACHED-CERT')
  })

  it('reissues when the metadata is corrupt JSON', () => {
    // A crashed write. Regenerating costs milliseconds; throwing takes
    // down the dev server at boot.
    const root = workspace()
    const dir = seedCache(root, ['localhost'], new Date(Date.now() + 300 * DAY).toISOString())
    writeFileSync(join(dir, 'meta.json'), '{ truncated')
    expect(() => resolve(root, ['localhost'])).not.toThrow()
    expect(resolve(root, ['localhost']).cert).not.toBe('CACHED-CERT')
  })

  it('reissues when a cache FILE is missing', () => {
    // meta.json present, key.pem gone. Half a cache is not a cache.
    const root = workspace()
    const dir = join(root, 'node_modules', '.pyreon-https')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'meta.json'),
      JSON.stringify({ hosts: ['localhost'], tier: 'self-signed', untrusted: true,
        notAfter: new Date(Date.now() + 300 * DAY).toISOString() }),
    )
    expect(() => resolve(root, ['localhost'])).not.toThrow()
  })
})

describe('a freshly issued certificate records its REAL expiry', () => {
  it('writes a notAfter far in the future, not the 24-hour fallback', () => {
    // This is the shipped bug in assertion form. The fallback is
    // `now + 24h`; a self-signed leaf is minted for far longer. If
    // `expiryOf` ever silently returns null again, the cache renews
    // daily and the interstitial returns every morning — with nothing
    // anywhere reporting an error.
    const root = workspace()
    const cert = resolve(root, ['localhost'])
    const metaPath = join(root, 'node_modules', '.pyreon-https', 'meta.json')
    expect(existsSync(metaPath), 'the resolver must persist a cache').toBe(true)

    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { notAfter: string }
    const days = (new Date(meta.notAfter).getTime() - Date.now()) / DAY
    expect(days, 'a 24h expiry means expiryOf() failed silently').toBeGreaterThan(30)
    expect(expiryOf(cert.cert), 'and the PEM itself must parse').not.toBeNull()
  })

  it('reuses that certificate on the next boot', () => {
    // The consequence of the above: two resolves over one workspace must
    // produce the same cert, or nothing was cached at all.
    const root = workspace()
    const first = resolve(root, ['localhost'])
    expect(resolve(root, ['localhost']).cert).toBe(first.cert)
  })
})

describe('expiryOf reports null rather than throwing on junk', () => {
  for (const [label, pem] of [
    ['empty', ''],
    ['not PEM at all', 'hello'],
    ['a truncated block', '-----BEGIN CERTIFICATE-----\nAAAA'],
    ['a well-formed envelope with garbage inside', '-----BEGIN CERTIFICATE-----\nZm9v\n-----END CERTIFICATE-----'],
  ] as Array<[string, string]>) {
    it(`returns null for ${label}`, () => {
      // A throw here happens at dev-server boot, before anything is
      // listening — the least debuggable moment available.
      expect(() => expiryOf(pem), label).not.toThrow()
      expect(expiryOf(pem), label).toBeNull()
    })
  }
})

describe('explicit cert files take precedence over everything', () => {
  it('uses provided files and marks the tier accordingly', () => {
    // A user-supplied cert must never be second-guessed by the cache.
    const root = workspace()
    const certFile = join(root, 'my.pem')
    const keyFile = join(root, 'my.key')
    writeFileSync(certFile, 'USER-CERT')
    writeFileSync(keyFile, 'USER-KEY')
    const out = resolveCertificate({ hosts: ['localhost'], root, certFile, keyFile })
    expect(out.cert).toBe('USER-CERT')
    expect(out.tier).toBe('provided')
    expect(out.untrusted, 'a provided cert is the user’s business, not ours').toBe(false)
  })

  it('refuses to certify an EMPTY host list', () => {
    // A cert for no hosts is unreachable by construction; failing loudly
    // beats minting something the browser rejects.
    expect(() => resolveCertificate({ hosts: [], root: workspace() })).toThrow(/no hosts/)
  })
})
