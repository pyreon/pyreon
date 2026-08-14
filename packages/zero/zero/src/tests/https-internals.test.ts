/**
 * The parts of `https()` the happy-path specs do not reach: the DER encoder's
 * error and long-form branches, the mkcert delegation, and the banner actually
 * being printed.
 *
 * The mkcert specs matter beyond coverage. That path decides whether the user
 * is told "no browser warning", and it cannot be exercised on a machine
 * without mkcert — which is most CI. Mocking the subprocess is the only way to
 * pin the rule that makes the claim honest: mkcert being INSTALLED is not
 * enough, its CA must also be TRUSTED, or its certificates are exactly as
 * untrusted as our own.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const execFileSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync,
}))

import { boolean, integer, nullValue, oid, tlv, utcTime } from '../https/der'
import { tryMkcert } from '../https/cert'
import { createSelfSignedCert, ipv6ToBytes } from '../https/selfsign'
import { lanAddresses } from '../https/hosts'
import { https } from '../https'

const roots: string[] = []
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})
afterEach(() => {
  execFileSync.mockReset()
})

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-https-int-'))
  roots.push(root)
  return root
}

describe('DER encoding edge cases', () => {
  it('rejects a malformed OID rather than emitting corrupt bytes', () => {
    expect(() => oid('1')).toThrow(/at least two arcs/)
    expect(() => oid('1.2.x')).toThrow(/invalid OID arc/)
    expect(() => oid('1.2.-3')).toThrow(/invalid OID arc/)
  })

  it('encodes a zero arc, and multi-byte arcs in base-128', () => {
    // 1.2.840.113549 is RSA's prefix — the classic multi-byte arc case.
    expect([...oid('1.2.840.113549')].slice(0, 2)).toEqual([0x06, 0x06])
    // A zero arc must emit a single 0x00, not nothing.
    expect([...oid('1.2.0')]).toEqual([0x06, 0x02, 0x2a, 0x00])
  })

  it('uses the long form for a value over 127 bytes', () => {
    const long = tlv(0x04, Buffer.alloc(200, 0x41))
    // 0x81 = long form, one length byte; then 200.
    expect(long[1]).toBe(0x81)
    expect(long[2]).toBe(200)
    const longer = tlv(0x04, Buffer.alloc(400, 0x41))
    expect(longer[1]).toBe(0x82)
    expect((longer[2]! << 8) | longer[3]!).toBe(400)
  })

  it('keeps INTEGER positive and minimal', () => {
    // High bit set => a leading zero is required, or it decodes as negative.
    expect([...integer(Buffer.from([0xff]))]).toEqual([0x02, 0x02, 0x00, 0xff])
    // Redundant leading zeros are stripped — DER requires the shortest form.
    expect([...integer(Buffer.from([0x00, 0x00, 0x01]))]).toEqual([0x02, 0x01, 0x01])
    // ...but not the one that carries the sign.
    expect([...integer(Buffer.from([0x00, 0x80]))]).toEqual([0x02, 0x02, 0x00, 0x80])
  })

  it('pins DER TRUE to 0xFF and NULL to empty', () => {
    expect([...boolean(true)]).toEqual([0x01, 0x01, 0xff])
    expect([...boolean(false)]).toEqual([0x01, 0x01, 0x00])
    expect([...nullValue()]).toEqual([0x05, 0x00])
  })

  it('refuses a year UTCTime cannot represent instead of encoding a wrong one', () => {
    // Silently emitting a UTCTime for 2050+ would produce a certificate that
    // reads as 1950 — a valid-looking date in the distant past.
    expect(() => utcTime(new Date('2050-01-01T00:00:00Z'))).toThrow(/GeneralizedTime/)
    expect(() => utcTime(new Date('1949-01-01T00:00:00Z'))).toThrow(/GeneralizedTime/)
  })
})

describe('IPv6 SANs', () => {
  it('rejects an over-long address rather than truncating it into a valid-looking one', () => {
    // Asserted against the parser directly, not through `createSelfSignedCert`:
    // `isIP` rejects this string, so the certificate path never treats it as an
    // address at all — it becomes a (nonsensical) DNS name, which is the right
    // outcome. The guard inside the parser is therefore defensive, and this is
    // where it can actually be reached.
    expect(() => ipv6ToBytes('1:2:3:4:5:6:7:8:9')).toThrow(/not a valid IPv6/)
  })

  it('treats a string that is not a valid IP as a DNS name rather than failing', () => {
    const material = createSelfSignedCert({ hosts: ['1:2:3:4:5:6:7:8:9'] })
    expect(material.cert).toContain('BEGIN CERTIFICATE')
  })

  it('handles a full (non-elided) address', () => {
    const material = createSelfSignedCert({ hosts: ['2001:0db8:0000:0000:0000:0000:0000:0001'] })
    expect(material.cert).toContain('BEGIN CERTIFICATE')
  })
})

describe('mkcert delegation', () => {
  it('is skipped when mkcert is not installed', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('command not found: mkcert')
    })
    expect(tryMkcert(['localhost'], makeRoot())).toBeNull()
  })

  it('is skipped when mkcert IS installed but its CA is NOT trusted', () => {
    // The rule that keeps the banner honest. Without `mkcert -install`, its
    // certificates are as untrusted as a self-signed one, so reporting
    // "no browser warning" would be a lie.
    const caRoot = makeRoot() // exists, but holds no rootCA.pem
    execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '-CAROOT') return Buffer.from(`${caRoot}\n`)
      throw new Error('should not reach cert generation')
    })
    expect(tryMkcert(['localhost'], makeRoot())).toBeNull()
  })

  it('uses mkcert when its CA IS trusted, and reports the certificate as trusted', () => {
    const caRoot = makeRoot()
    writeFileSync(join(caRoot, 'rootCA.pem'), 'x')
    const out = makeRoot()
    execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '-CAROOT') return Buffer.from(`${caRoot}\n`)
      // Stand in for mkcert writing the pair it was asked for.
      const certPath = args[args.indexOf('-cert-file') + 1]!
      const keyPath = args[args.indexOf('-key-file') + 1]!
      mkdirSync(join(certPath, '..'), { recursive: true })
      writeFileSync(certPath, 'CERT')
      writeFileSync(keyPath, 'KEY')
      return Buffer.from('')
    })

    const result = tryMkcert(['localhost', '192.168.1.24'], out)
    expect(result?.tier).toBe('mkcert')
    expect(result?.untrusted).toBe(false)
    expect(result?.cert).toBe('CERT')
    // Every host must reach the subprocess, or the certificate silently covers
    // fewer names than asked for.
    const call = execFileSync.mock.calls.find((c) => (c[1] as string[])[0] !== '-CAROOT')
    expect(call?.[1]).toContain('192.168.1.24')
  })

  it('falls back rather than crashing the dev server when mkcert itself fails', () => {
    const caRoot = makeRoot()
    writeFileSync(join(caRoot, 'rootCA.pem'), 'x')
    execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '-CAROOT') return Buffer.from(`${caRoot}\n`)
      throw new Error('mkcert: unsupported host pattern')
    })
    expect(tryMkcert(['*.bad.pattern'], makeRoot())).toBeNull()
  })

  it('treats empty CAROOT output as "not available"', () => {
    execFileSync.mockImplementation(() => Buffer.from('\n'))
    expect(tryMkcert(['localhost'], makeRoot())).toBeNull()
  })
})

describe('ESM discipline', () => {
  it('uses no `require()` — this package is type: module, where it is undefined', async () => {
    // A behavioural test CANNOT catch this: bun defines `require` in ESM as a
    // convenience, so the entire suite passes while the shipped path is broken
    // under Node. It shipped once already — `expiryOf` did
    // `require('node:crypto')`, threw a ReferenceError under Node, was
    // swallowed by its own catch, and every certificate silently got a
    // 24-hour fallback expiry instead of 825 days. The user-visible symptom
    // would have been the browser interstitial returning EVERY DAY.
    //
    // So the check is static, which is runtime-independent and precise.
    const { readdirSync, readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const dir = fileURLToPath(new URL('../https/', import.meta.url))
    const offenders: string[] = []
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(dir, file), 'utf8')
      // Ignore the word inside comments and strings; match a real call.
      for (const line of source.split('\n')) {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue
        if (/\brequire\s*\(/.test(line)) offenders.push(`${file}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('lanAddresses', () => {
  it('returns entries shaped for the banner, best candidate first', () => {
    // Cannot assert specific addresses — they are whatever this machine has —
    // but the CONTRACT (shape, and IPv4-before-IPv6 ordering) is assertable.
    const found = lanAddresses()
    for (const addr of found) {
      expect(typeof addr.address).toBe('string')
      expect(typeof addr.iface).toBe('string')
      expect(['IPv4', 'IPv6']).toContain(addr.family)
      expect(addr.address).not.toMatch(/^169\.254\./)
    }
    const firstV6 = found.findIndex((a) => a.family === 'IPv6')
    const lastV4 = found.map((a) => a.family).lastIndexOf('IPv4')
    if (firstV6 !== -1 && lastV4 !== -1) expect(lastV4).toBeLessThan(firstV6)
  })
})

describe('the banner reaches the logger', () => {
  it('prints under the dev server URLs through Vite\'s logger, not console', async () => {
    const { createServer } = await import('vite')
    const root = makeRoot()
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>t</title>')
    const info: string[] = []

    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'info',
      plugins: [https({ selfSigned: true })],
      server: { port: 0 },
      customLogger: {
        info: (msg: string) => info.push(msg),
        warn: () => {},
        warnOnce: () => {},
        error: () => {},
        clearScreen: () => {},
        hasErrorLogged: () => false,
        hasWarned: false,
      },
    })
    try {
      await server.listen()
      server.printUrls()
      const printed = info.join('\n')
      expect(printed).toContain('Secure context')
      expect(printed).toContain('mkcert -install')
    } finally {
      await server.close()
    }
  }, 60_000)
})
