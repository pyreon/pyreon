/**
 * The certificate half of `https()`.
 *
 * The load-bearing specs here do not inspect bytes — they stand up a real TLS
 * server with the generated material and connect to it. A hand-written X.509
 * encoder is exactly the kind of code that can look right, parse in one tool,
 * and still be rejected by the stack that matters, so the assertion is "a TLS
 * client completed a handshake against this", not "the DER looks plausible".
 */
import { createServer as createHttpsServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { connect } from 'node:tls'
import { describe, expect, it } from 'vitest'

import { createSelfSignedCert, dedupeHosts, ipv6ToBytes } from '../https/selfsign'
import { hostsFileHint, isLinkLocal, isPrivateV4, lanAddresses, needsHostsFileEntry, resolveHosts } from '../https/hosts'
import { bannerLines, unreachableCertifiedIps } from '../https'
import type { Certificate } from '../https/cert'

/**
 * Serve one request over TLS with `material`, connect, and report what the
 * client saw. `rejectUnauthorized` is false because a self-signed certificate
 * is untrusted BY DESIGN — this proves the handshake completes and the
 * certificate parses, which is what a browser does after you click through.
 */
async function handshake(
  material: { cert: string; key: string },
  servername: string,
): Promise<{ ok: boolean; subject?: string; san?: string; error?: string }> {
  const server = createHttpsServer({ cert: material.cert, key: material.key }, (_req, res) => res.end('ok'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    return await new Promise((resolve) => {
      const socket = connect({ host: '127.0.0.1', port, servername, rejectUnauthorized: false }, () => {
        const peer = socket.getPeerCertificate()
        socket.end()
        resolve({ ok: true, subject: peer.subject?.CN as string | undefined, san: peer.subjectaltname })
      })
      socket.on('error', (err) => resolve({ ok: false, error: (err as Error).message }))
    })
  } finally {
    server.close()
  }
}

describe('createSelfSignedCert', () => {
  it('produces material a real TLS client can complete a handshake against', async () => {
    const material = createSelfSignedCert({ hosts: ['localhost'] })
    const result = await handshake(material, 'localhost')
    expect(result.error ?? 'none').toBe('none')
    expect(result.ok).toBe(true)
  })

  it('encodes DNS names, IPv4 and IPv6 as the RIGHT kind of SAN', async () => {
    // This is the spec that would catch a DER bug. An IP put in a `dNSName`
    // parses fine and is then IGNORED by every browser, so the certificate
    // would look correct and silently fail to match `https://192.168.1.24`,
    // which is the exact case `lan: true` exists to serve.
    const material = createSelfSignedCert({ hosts: ['localhost', '127.0.0.1', '192.168.1.24', '::1'] })
    const result = await handshake(material, 'localhost')
    expect(result.ok).toBe(true)
    expect(result.san).toContain('DNS:localhost')
    expect(result.san).toContain('IP Address:127.0.0.1')
    expect(result.san).toContain('IP Address:192.168.1.24')
    // Node renders an IPv6 SAN fully expanded.
    expect(result.san).toContain('IP Address:0:0:0:0:0:0:0:1')
  })

  it('names the certificate after the first host', async () => {
    const material = createSelfSignedCert({ hosts: ['app.localhost', '127.0.0.1'] })
    const result = await handshake(material, 'app.localhost')
    expect(result.subject).toBe('app.localhost')
  })

  it('backdates notBefore so a device with a slightly slow clock still connects', () => {
    const now = new Date('2026-06-01T12:00:00Z')
    const material = createSelfSignedCert({ hosts: ['localhost'], now, days: 10 })
    // Not asserting the exact hour, but that it is in the past: a certificate
    // that becomes valid exactly "now" is an intermittent failure on a phone
    // that has not synced time, which is miserable to diagnose.
    expect(material.notAfter.getTime()).toBeGreaterThan(now.getTime())
  })

  it('refuses to mint a certificate with no hosts rather than emitting a useless one', () => {
    expect(() => createSelfSignedCert({ hosts: [] })).toThrow(/at least one host/)
    expect(() => createSelfSignedCert({ hosts: ['  '] })).toThrow(/at least one host/)
  })

  it('de-duplicates case-insensitively while preserving order', () => {
    // Order matters — the first entry becomes the CN — so this must not sort.
    expect(dedupeHosts(['B.test', 'a.test', 'b.TEST', 'a.test'])).toEqual(['B.test', 'a.test'])
  })
})

describe('ipv6ToBytes', () => {
  it('expands the :: elision to the right 16 bytes', () => {
    expect([...ipv6ToBytes('::1')]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect([...ipv6ToBytes('2001:db8::1')].slice(0, 4)).toEqual([0x20, 0x01, 0x0d, 0xb8])
    expect(ipv6ToBytes('fe80::1').length).toBe(16)
  })

  it('drops a zone id, which is a local routing concept and not part of identity', () => {
    expect([...ipv6ToBytes('fe80::1%en0')]).toEqual([...ipv6ToBytes('fe80::1')])
  })
})

describe('host resolution', () => {
  it('always covers loopback, and puts it first so the CN is readable', () => {
    const resolved = resolveHosts()
    expect(resolved.all.slice(0, 3)).toEqual(['localhost', '127.0.0.1', '::1'])
  })

  it('appends custom hosts', () => {
    expect(resolveHosts({ hosts: ['app.localhost'] }).all).toContain('app.localhost')
  })

  it('knows which names need a hosts-file entry, and which resolve natively', () => {
    // `*.localhost` is the recommendation precisely because it needs nothing.
    expect(needsHostsFileEntry('app.localhost')).toBe(false)
    expect(needsHostsFileEntry('localhost')).toBe(false)
    expect(needsHostsFileEntry('192.168.1.5')).toBe(false)
    expect(needsHostsFileEntry('::1')).toBe(false)
    expect(needsHostsFileEntry('app.test')).toBe(true)
    expect(needsHostsFileEntry('dev.acme.com')).toBe(true)
  })

  it('prints the hosts lines rather than offering to write them', () => {
    const hint = hostsFileHint(['localhost', 'app.test'])
    expect(hint).toContain('127.0.0.1  app.test')
    // The nudge toward the zero-friction option is the useful half.
    expect(hint).toContain('.localhost')
    expect(hostsFileHint(['localhost', 'app.localhost'])).toBeNull()
  })

  it('excludes link-local in BOTH families, not just IPv4', () => {
    // Found by running a real dev server: a laptop produced eight `fe80::`
    // addresses, all of which landed in the certificate. Link-local is never
    // reachable from another device (v6 needs a zone index at all), so it is
    // pure noise — and the v4 half was already filtered, so this was an
    // asymmetry rather than a considered choice.
    expect(isLinkLocal('169.254.1.1', 'IPv4')).toBe(true)
    expect(isLinkLocal('192.168.1.5', 'IPv4')).toBe(false)
    expect(isLinkLocal('fe80::1', 'IPv6')).toBe(true)
    // The range is fe80::/10 — the whole fe80-febf block, not only fe80.
    expect(isLinkLocal('feb0::1', 'IPv6')).toBe(true)
    expect(isLinkLocal('FE80:0:0:0:484:C64C:DA08:C964', 'IPv6')).toBe(true)
    // A unique-local (fc00::/7) or global address IS routable — keep it.
    expect(isLinkLocal('fd00::1', 'IPv6')).toBe(false)
    expect(isLinkLocal('2001:db8::1', 'IPv6')).toBe(false)
  })

  it('never returns a link-local address from the real interface list', () => {
    for (const addr of lanAddresses()) {
      expect(isLinkLocal(addr.address, addr.family)).toBe(false)
    }
  })

  it('classifies private IPv4 ranges', () => {
    expect(isPrivateV4('192.168.1.5')).toBe(true)
    expect(isPrivateV4('10.0.0.1')).toBe(true)
    expect(isPrivateV4('172.16.0.1')).toBe(true)
    expect(isPrivateV4('172.32.0.1')).toBe(false)
    expect(isPrivateV4('8.8.8.8')).toBe(false)
    expect(isPrivateV4('not.an.ip')).toBe(false)
  })
})

describe('the unreachable-address warning', () => {
  // Closes a footgun that was previously only DOCUMENTED: certifying a LAN
  // address without `lan: true` produces a certificate for something the
  // server never binds to, so the phone gets connection-refused with no clue.
  it('names an IP the server cannot answer on', () => {
    expect(unreachableCertifiedIps(['localhost', '127.0.0.1', '::1', '192.168.1.5'], false)).toEqual([
      '192.168.1.5',
    ])
  })

  it('says nothing when the server IS bound beyond loopback', () => {
    // Someone who passed `--host` themselves is correctly configured. Warning
    // them would be worse than silence — this is what keeps it trustworthy.
    for (const host of [true, '0.0.0.0', '192.168.1.5']) {
      expect(unreachableCertifiedIps(['192.168.1.5'], host)).toEqual([])
    }
  })

  it('never flags loopback or a hostname', () => {
    // A `.localhost` name or a hosts-file entry legitimately resolves to
    // 127.0.0.1, which the server DOES answer on.
    expect(unreachableCertifiedIps(['localhost', 'app.localhost', 'app.test'], false)).toEqual([])
    expect(unreachableCertifiedIps(['127.0.0.1', '127.0.0.53', '::1'], false)).toEqual([])
  })
})

describe('the banner', () => {
  const base: Certificate = {
    cert: '',
    key: '',
    tier: 'self-signed',
    hosts: ['localhost'],
    untrusted: true,
  }

  it('says a self-signed certificate will warn, and how to stop it warning', () => {
    const text = bannerLines(base, [], null).join('\n')
    expect(text).toContain('self-signed')
    expect(text).toContain('mkcert -install')
    // The security posture is stated where the user is, not only in the docs.
    expect(text).toContain('never installs a certificate authority')
  })

  it('does NOT claim a warning for an mkcert certificate', () => {
    const text = bannerLines({ ...base, tier: 'mkcert', untrusted: false }, [], null).join('\n')
    expect(text).not.toContain('self-signed')
    expect(text).toContain('no browser warning')
  })

  it('names the LAN address, because that is the whole reason to enable this', () => {
    const text = bannerLines(base, [{ address: '192.168.1.24', iface: 'en0', family: 'IPv4' }], null).join('\n')
    expect(text).toContain('192.168.1.24')
    expect(text).toContain('en0')
    expect(text).toContain('camera')
  })

  it('is empty when no certificate was resolved, rather than printing a lie', () => {
    expect(bannerLines(null, [], null)).toEqual([])
  })
})
