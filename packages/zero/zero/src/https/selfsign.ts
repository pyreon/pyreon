/**
 * A self-signed X.509 certificate for local development, built on `node:crypto`
 * and the DER encoder next door. No dependencies, so the zero-config path
 * works on a clean machine — which is the whole point of `https()`.
 *
 * This certificate is NOT trusted by any browser: it is signed by itself, and
 * nothing has that key in a trust store. The browser shows a one-time
 * interstitial you click through. That is deliberate and it is the honest
 * default — the alternative is installing a root CA into the user's trust
 * store, which `https()` will not do (see `cert.ts` for the reasoning and the
 * mkcert path that gets you a warning-free certificate without us ever holding
 * a CA key).
 *
 * P-256 rather than RSA: generation is instantaneous where RSA-2048 costs
 * hundreds of milliseconds on every cold start, and every browser released
 * since roughly 2013 supports it. The certificate is cached to disk anyway,
 * but a dev server should not stall on cryptography it can avoid.
 */
import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto'
import { isIP } from 'node:net'

import {
  bitString,
  boolean,
  contextTag,
  ia5String,
  integer,
  integerFromNumber,
  oid,
  octetString,
  printableString,
  seq,
  set,
  utcTime,
} from './der'

/** OIDs used below, named so the assembly reads as the RFC 5280 structure. */
const OID = {
  commonName: '2.5.4.3',
  organizationName: '2.5.4.10',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  subjectAltName: '2.5.29.17',
  serverAuth: '1.3.6.1.5.5.7.3.1',
} as const

export interface SelfSignedOptions {
  /**
   * Every name the certificate should be valid for — DNS names and IP
   * addresses both. An IP is detected and encoded as an `iPAddress` SAN, which
   * is what makes `https://192.168.1.24:3000` work on a phone; a DNS SAN
   * holding an IP literal is ignored by browsers.
   */
  hosts: string[]
  /** Days until expiry. Kept short by default — see `cert.ts`. */
  days?: number
  /** Fixed timestamp, for reproducible tests. Defaults to now. */
  now?: Date
}

export interface SelfSignedResult {
  /** PEM certificate, ready for `server.https.cert`. */
  cert: string
  /** PEM PKCS#8 private key, ready for `server.https.key`. */
  key: string
  /** The SANs actually encoded, in order — what the tests assert against. */
  hosts: string[]
  notAfter: Date
}

/**
 * A SAN entry. DNS is `[2] IA5String`; IP is `[7] OCTET STRING` holding the
 * address in network byte order — 4 bytes for v4, 16 for v6.
 */
function generalName(host: string): Buffer {
  const kind = isIP(host)
  if (kind === 4) {
    const octets = host.split('.').map((n) => Number(n))
    return contextTag(7, Buffer.from(octets), false)
  }
  if (kind === 6) {
    return contextTag(7, ipv6ToBytes(host), false)
  }
  return contextTag(2, ia5String(host).subarray(2), false)
}

/**
 * IPv6 text to its 16 bytes, including the `::` run-length elision. Written
 * out rather than pulled from a dependency because it is the only piece of
 * v6 handling this file needs, and a wrong answer here is a certificate that
 * silently does not match the address.
 */
export function ipv6ToBytes(address: string): Buffer {
  // A zone id (`fe80::1%en0`) is a local addressing concept, never part of the
  // certificate identity.
  const addr = address.split('%')[0] ?? address
  const [head = '', tail = ''] = addr.includes('::') ? addr.split('::') : [addr, '']
  const parse = (part: string): number[] =>
    part.length === 0 ? [] : part.split(':').flatMap((g) => {
      const v = Number.parseInt(g, 16)
      return [(v >> 8) & 0xff, v & 0xff]
    })
  const left = parse(head)
  const right = addr.includes('::') ? parse(tail) : []
  const gap = 16 - left.length - right.length
  if (gap < 0) throw new Error(`[Pyreon] not a valid IPv6 address: ${address}`)
  return Buffer.from([...left, ...new Array<number>(gap).fill(0), ...right])
}

/** A single X.509 extension: `SEQUENCE { OID, critical DEFAULT FALSE, OCTET STRING }`. */
function extension(id: string, critical: boolean, value: Buffer): Buffer {
  // DER omits a DEFAULT-valued field entirely, so `critical: false` must encode
  // as nothing at all rather than as an explicit FALSE.
  return critical
    ? seq(oid(id), boolean(true), octetString(value))
    : seq(oid(id), octetString(value))
}

/** `CN=<name>` — one RDN, which is all a dev certificate needs. */
function distinguishedName(commonName: string): Buffer {
  return seq(
    set(seq(oid(OID.commonName), printableString(commonName))),
    set(seq(oid(OID.organizationName), printableString('Pyreon Local Development'))),
  )
}

export function createSelfSignedCert(options: SelfSignedOptions): SelfSignedResult {
  const hosts = dedupeHosts(options.hosts)
  if (hosts.length === 0) {
    throw new Error('[Pyreon] a certificate needs at least one host')
  }

  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  // Node hands back a complete SubjectPublicKeyInfo, so the one genuinely
  // fiddly structure is free.
  const spki = publicKey.export({ type: 'spki', format: 'der' })

  const now = options.now ?? new Date()
  // Backdate slightly: a certificate whose notBefore is "now" is rejected by a
  // client whose clock is a few seconds behind, which is a maddening
  // intermittent failure on a phone that has not synced time.
  const notBefore = new Date(now.getTime() - 60 * 60 * 1000)
  const notAfter = new Date(now.getTime() + (options.days ?? 825) * 24 * 60 * 60 * 1000)

  const signatureAlgorithm = seq(oid(OID.ecdsaWithSha256))
  const name = distinguishedName(hosts[0]!)

  // KeyUsage is a BIT STRING read left to right: bit 0 digitalSignature,
  // bit 2 keyEncipherment. 0xa0 sets both; 3 trailing bits are unused.
  const keyUsage = bitString(Buffer.from([0xa0]), 3)

  const tbs = seq(
    contextTag(0, integerFromNumber(2), true), // v3
    integer(randomBytes(16)),
    signatureAlgorithm,
    name, // self-signed: issuer === subject
    seq(utcTime(notBefore), utcTime(notAfter)),
    name,
    spki,
    contextTag(
      3,
      seq(
        extension(OID.basicConstraints, true, seq()),
        extension(OID.keyUsage, true, keyUsage),
        extension(OID.extKeyUsage, false, seq(oid(OID.serverAuth))),
        extension(OID.subjectAltName, false, seq(...hosts.map(generalName))),
      ),
      true,
    ),
  )

  const signature = createSign('SHA256').update(tbs).sign({ key: privateKey, dsaEncoding: 'der' })
  const certificate = seq(tbs, signatureAlgorithm, bitString(signature))

  return {
    cert: toPem(certificate, 'CERTIFICATE'),
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    hosts,
    notAfter,
  }
}

/**
 * Case-insensitive de-duplication that preserves order. The first host becomes
 * the CN, so order is meaningful and must not be sorted away.
 */
export function dedupeHosts(hosts: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const host of hosts) {
    const trimmed = host.trim()
    if (trimmed.length === 0) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function toPem(der: Buffer, label: string): string {
  const body = der.toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n$/, '')
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`
}
