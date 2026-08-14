/**
 * The smallest ASN.1 DER encoder that can express an X.509 certificate.
 *
 * This exists so `https()` can mint a dev certificate with **zero
 * dependencies**. The alternatives were all worse for a framework:
 *
 *   • `node-forge` / `selfsigned` — ~1 MB of dependency for a dev-only
 *     feature, paid for by every `@pyreon/zero` install.
 *   • an OPTIONAL peer — then the zero-config path fails on a clean machine,
 *     which is the one thing this feature exists to prevent.
 *   • shelling out to `openssl` — absent on Windows by default, and the
 *     failure mode is a confusing spawn error rather than a certificate.
 *
 * Node's `crypto` can generate a keypair, export an SPKI, and sign — it just
 * cannot assemble an X.509 body. That assembly is this file, and it is a
 * closed, well-specified problem (X.690 for the encoding, RFC 5280 for the
 * structure), verified end to end by an actual TLS handshake in the tests
 * rather than by eyeballing bytes.
 *
 * Only the subset X.509 needs is implemented. Every function returns a
 * complete TLV (tag + length + value) so they compose by concatenation.
 */

/** ASN.1 universal tag numbers, plus the two constructed forms we build. */
const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  PRINTABLE_STRING: 0x13,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  SEQUENCE: 0x30,
  SET: 0x31,
} as const

/**
 * DER length: short form below 128, else a length-of-length byte with the high
 * bit set followed by big-endian bytes. DER (unlike BER) forbids the
 * indefinite form and requires the SHORTEST encoding, which is what makes a
 * certificate byte-reproducible.
 */
function encodeLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len])
  const bytes: number[] = []
  let n = len
  while (n > 0) {
    bytes.unshift(n & 0xff)
    n >>>= 8
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

/** Wrap a value in its tag and length — the one primitive everything uses. */
export function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(value.length), value])
}

export function seq(...parts: Buffer[]): Buffer {
  return tlv(TAG.SEQUENCE, Buffer.concat(parts))
}

export function set(...parts: Buffer[]): Buffer {
  return tlv(TAG.SET, Buffer.concat(parts))
}

/**
 * INTEGER from raw big-endian bytes. ASN.1 integers are SIGNED, so a leading
 * byte with the high bit set would decode as negative — prepend a zero. This
 * matters for serial numbers, which are random: one in two would otherwise be
 * a negative serial, which some validators reject outright.
 */
export function integer(bytes: Buffer): Buffer {
  let v = bytes
  // DER also requires the minimal encoding: strip leading zeros, but keep one
  // if the next byte would flip the sign.
  let i = 0
  while (i < v.length - 1 && v[i] === 0x00 && (v[i + 1]! & 0x80) === 0) i += 1
  v = v.subarray(i)
  if ((v[0]! & 0x80) !== 0) v = Buffer.concat([Buffer.from([0x00]), v])
  return tlv(TAG.INTEGER, v)
}

/** INTEGER from a small non-negative JS number (versions, path lengths). */
export function integerFromNumber(n: number): Buffer {
  if (n === 0) return tlv(TAG.INTEGER, Buffer.from([0x00]))
  const bytes: number[] = []
  let v = n
  while (v > 0) {
    bytes.unshift(v & 0xff)
    v >>>= 8
  }
  return integer(Buffer.from(bytes))
}

export function boolean(value: boolean): Buffer {
  // DER pins TRUE to 0xFF; BER would allow any non-zero.
  return tlv(TAG.BOOLEAN, Buffer.from([value ? 0xff : 0x00]))
}

export function nullValue(): Buffer {
  return tlv(TAG.NULL, Buffer.alloc(0))
}

export function octetString(value: Buffer): Buffer {
  return tlv(TAG.OCTET_STRING, value)
}

/**
 * BIT STRING with a leading "unused bits" byte. Everything X.509 puts in a bit
 * string is byte-aligned except KeyUsage, which passes its own count.
 */
export function bitString(value: Buffer, unusedBits = 0): Buffer {
  return tlv(TAG.BIT_STRING, Buffer.concat([Buffer.from([unusedBits]), value]))
}

export function utf8String(value: string): Buffer {
  return tlv(TAG.UTF8_STRING, Buffer.from(value, 'utf8'))
}

export function printableString(value: string): Buffer {
  return tlv(TAG.PRINTABLE_STRING, Buffer.from(value, 'ascii'))
}

export function ia5String(value: string): Buffer {
  return tlv(TAG.IA5_STRING, Buffer.from(value, 'ascii'))
}

/**
 * OBJECT IDENTIFIER from dotted notation. The first two arcs are packed into
 * one byte as `40*a + b`; every arc after that is base-128 with a continuation
 * bit on all but the final byte.
 */
export function oid(dotted: string): Buffer {
  const arcs = dotted.split('.').map((n) => {
    const v = Number(n)
    if (!Number.isInteger(v) || v < 0) throw new Error(`[Pyreon] invalid OID arc in "${dotted}"`)
    return v
  })
  if (arcs.length < 2) throw new Error(`[Pyreon] OID needs at least two arcs: "${dotted}"`)
  const out: number[] = [40 * arcs[0]! + arcs[1]!]
  for (const arc of arcs.slice(2)) {
    if (arc === 0) {
      out.push(0)
      continue
    }
    const chunk: number[] = []
    let v = arc
    while (v > 0) {
      chunk.unshift(v & 0x7f)
      v >>>= 7
    }
    for (let i = 0; i < chunk.length - 1; i += 1) chunk[i]! |= 0x80
    out.push(...chunk)
  }
  return tlv(TAG.OID, Buffer.from(out))
}

/**
 * UTCTime as `YYMMDDHHMMSSZ`. RFC 5280 mandates UTCTime for dates before 2050
 * and GeneralizedTime after — a dev certificate never lives that long, and the
 * caller is bounds-checked rather than silently emitting the wrong type.
 */
export function utcTime(date: Date): Buffer {
  const year = date.getUTCFullYear()
  if (year < 1950 || year >= 2050) {
    throw new Error(`[Pyreon] UTCTime cannot represent ${year}; GeneralizedTime is required`)
  }
  const p = (n: number): string => String(n).padStart(2, '0')
  const stamp =
    p(year % 100) +
    p(date.getUTCMonth() + 1) +
    p(date.getUTCDate()) +
    p(date.getUTCHours()) +
    p(date.getUTCMinutes()) +
    p(date.getUTCSeconds()) +
    'Z'
  return tlv(TAG.UTC_TIME, Buffer.from(stamp, 'ascii'))
}

/**
 * Context-specific tag. `constructed` wraps an inner TLV (X.509's `[0] EXPLICIT
 * version`); primitive carries a raw payload (a SAN `dNSName`).
 */
export function contextTag(number: number, value: Buffer, constructed: boolean): Buffer {
  const tag = 0x80 | (constructed ? 0x20 : 0x00) | number
  return tlv(tag, value)
}
