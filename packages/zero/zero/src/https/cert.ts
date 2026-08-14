/**
 * Where the dev certificate comes from, in three tiers.
 *
 * ── Why `https()` will not install a root CA ──────────────────────────────
 *
 * Making a browser trust a locally-minted certificate means putting a CA into
 * the OS and browser trust stores. This plugin deliberately does not do that,
 * and the reasoning is worth stating because "just trust it automatically" is
 * the obvious-looking feature request:
 *
 *   • A local CA private key on disk can mint a valid certificate for ANY
 *     domain. Whoever reads that file can intercept the user's traffic to
 *     their bank, not just to localhost. Installing it is a real, lasting
 *     change to the machine's security posture.
 *   • It is per-OS AND per-browser — Firefox and Chromium keep their own
 *     stores, Linux needs NSS `certutil`. Getting it subtly wrong leaves a
 *     trusted CA the user cannot find to remove.
 *   • `mkcert` already does this well, is widely deployed, and documents the
 *     risk. Reimplementing it badly helps nobody.
 *
 * So: if mkcert is installed WITH its CA already trusted, we use it and get a
 * warning-free certificate without ever holding a CA key. Otherwise we mint a
 * self-signed leaf, which works immediately behind a one-time browser
 * interstitial, and we say so.
 */
import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createSelfSignedCert } from './selfsign'

/** How the certificate was obtained. Surfaced so the banner can be honest. */
export type CertTier = 'provided' | 'mkcert' | 'self-signed'

export interface Certificate {
  cert: string
  key: string
  tier: CertTier
  hosts: string[]
  /** True when a browser will show an interstitial. */
  untrusted: boolean
}

export interface ResolveCertOptions {
  hosts: string[]
  /** Project root; the cache lives under its `node_modules`. */
  root: string
  /** BYO paths. When set, nothing is generated. */
  certFile?: string | undefined
  keyFile?: string | undefined
  /** Skip mkcert detection (used by tests, and by anyone who wants determinism). */
  preferSelfSigned?: boolean | undefined
}

const CACHE_DIR = join('node_modules', '.pyreon-https')
/**
 * 825 days is the CA/Browser Forum's maximum for a public certificate. Nothing
 * enforces it on a self-signed dev cert, but Safari/iOS refuse certificates
 * with an unreasonably long lifetime, and a phone is the primary target here.
 */
const CERT_DAYS = 825
/** Regenerate before it actually expires, so a long-lived checkout never breaks. */
const RENEW_WITHIN_DAYS = 30

/**
 * Resolve a certificate for `hosts`, generating and caching one if needed.
 *
 * The cache key is the host list: add a LAN address or a custom domain and the
 * old certificate no longer covers it, so it must be reissued rather than
 * silently reused. That is the failure this keying prevents — a certificate
 * that loads fine and then fails to match, which presents as an opaque browser
 * error rather than as a stale cache.
 */
export function resolveCertificate(options: ResolveCertOptions): Certificate {
  const hosts = options.hosts
  if (hosts.length === 0) throw new Error('[Pyreon] https(): no hosts to certify')

  // ── Tier A: bring your own ───────────────────────────────────────────────
  if (options.certFile !== undefined || options.keyFile !== undefined) {
    if (options.certFile === undefined || options.keyFile === undefined) {
      throw new Error('[Pyreon] https({ cert, key }): both must be given, or neither')
    }
    for (const [label, file] of [['cert', options.certFile], ['key', options.keyFile]] as const) {
      if (!existsSync(file)) throw new Error(`[Pyreon] https(): ${label} file not found: ${file}`)
    }
    return {
      cert: readFileSync(options.certFile, 'utf8'),
      key: readFileSync(options.keyFile, 'utf8'),
      tier: 'provided',
      hosts,
      // We cannot know whether a supplied certificate is trusted, and guessing
      // wrong in either direction produces a misleading banner. Claim nothing.
      untrusted: false,
    }
  }

  const cacheDir = join(options.root, CACHE_DIR)
  const cached = readCache(cacheDir, hosts)
  if (cached) return cached

  // ── Tier B: delegate to mkcert, if it is installed AND its CA is trusted ──
  if (options.preferSelfSigned !== true) {
    const viaMkcert = tryMkcert(hosts, cacheDir)
    if (viaMkcert) {
      writeCache(cacheDir, viaMkcert)
      return viaMkcert
    }
  }

  // ── Tier C: self-signed ──────────────────────────────────────────────────
  const generated = createSelfSignedCert({ hosts, days: CERT_DAYS })
  const result: Certificate = {
    cert: generated.cert,
    key: generated.key,
    tier: 'self-signed',
    hosts: generated.hosts,
    untrusted: true,
  }
  writeCache(cacheDir, result)
  return result
}

interface CacheFile {
  hosts: string[]
  tier: CertTier
  untrusted: boolean
  notAfter: string
}

function readCache(dir: string, hosts: string[]): Certificate | null {
  const meta = join(dir, 'meta.json')
  const certPath = join(dir, 'cert.pem')
  const keyPath = join(dir, 'key.pem')
  if (!existsSync(meta) || !existsSync(certPath) || !existsSync(keyPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(meta, 'utf8')) as CacheFile
    if (!sameHosts(parsed.hosts, hosts)) return null
    const notAfter = new Date(parsed.notAfter)
    const renewAt = notAfter.getTime() - RENEW_WITHIN_DAYS * 24 * 60 * 60 * 1000
    if (Number.isNaN(notAfter.getTime()) || Date.now() >= renewAt) return null
    return {
      cert: readFileSync(certPath, 'utf8'),
      key: readFileSync(keyPath, 'utf8'),
      tier: parsed.tier,
      hosts: parsed.hosts,
      untrusted: parsed.untrusted,
    }
  } catch {
    // A corrupt cache must never be fatal — regenerating costs milliseconds.
    return null
  }
}

function writeCache(dir: string, cert: Certificate): void {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'cert.pem'), cert.cert)
    // The private key is readable only by its owner. It is a dev key for
    // localhost, but a world-readable TLS key is a bad habit to teach.
    writeFileSync(join(dir, 'key.pem'), cert.key, { mode: 0o600 })
    const meta: CacheFile = {
      hosts: cert.hosts,
      tier: cert.tier,
      untrusted: cert.untrusted,
      notAfter: expiryOf(cert.cert)?.toISOString() ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    }
    writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
    writeFileSync(join(dir, '.gitignore'), '*\n')
  } catch {
    // An unwritable node_modules (a read-only mount, a sandbox) must not stop
    // the dev server — we just regenerate next time.
  }
}

/**
 * Read `notAfter` from a PEM. Node's `X509Certificate` does the parsing; this
 * only exists so the cache can renew before expiry instead of after.
 */
export function expiryOf(pem: string): Date | null {
  try {
    // Statically imported, NOT `require`d. This package is `type: module`, so
    // `require` is undefined under Node — the call threw, the catch below
    // swallowed it, and every certificate got the 24-hour fallback expiry
    // instead of its real 825 days. The visible symptom would have been the
    // browser interstitial returning EVERY DAY as the cache silently reissued.
    // Bun defines `require` in ESM as a convenience, so the whole test suite
    // passed while the shipped path was broken.
    const parsed = new X509Certificate(pem)
    const date = new Date(parsed.validTo)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

function sameHosts(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((host, i) => host.toLowerCase() === b[i]?.toLowerCase())
}

/**
 * Use mkcert if — and only if — it is installed and its CA is already in the
 * trust store. mkcert alone is not enough: without `mkcert -install` having
 * been run, its certificates are exactly as untrusted as our own, and we would
 * be shelling out to a subprocess for no gain while reporting "trusted".
 */
export function tryMkcert(hosts: string[], outDir: string): Certificate | null {
  const caRoot = mkcertCaRoot()
  if (caRoot === null) return null

  try {
    mkdirSync(outDir, { recursive: true })
    const certPath = join(outDir, 'cert.pem')
    const keyPath = join(outDir, 'key.pem')
    execFileSync('mkcert', ['-cert-file', certPath, '-key-file', keyPath, ...hosts], {
      stdio: 'pipe',
      timeout: 30_000,
    })
    return {
      cert: readFileSync(certPath, 'utf8'),
      key: readFileSync(keyPath, 'utf8'),
      tier: 'mkcert',
      hosts,
      untrusted: false,
    }
  } catch {
    // mkcert can fail for reasons we should not turn into a dev-server crash
    // (an unsupported host pattern, a broken install). Fall through to
    // self-signed, which always works.
    return null
  }
}

/**
 * `mkcert -CAROOT` prints where the CA lives; the CA is only TRUSTED once
 * `mkcert -install` has put it in the store, and the marker for that is the
 * root certificate existing in that directory.
 */
function mkcertCaRoot(): string | null {
  try {
    const out = execFileSync('mkcert', ['-CAROOT'], { stdio: 'pipe', timeout: 5_000 })
      .toString()
      .trim()
    if (out.length === 0) return null
    return existsSync(join(out, 'rootCA.pem')) ? out : null
  } catch {
    return null
  }
}
