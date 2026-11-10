/**
 * Server-island fragment signatures.
 *
 * A server island's fragment (`GET /_pyreon/fragment/<name>`) renders on its
 * own request, away from the page that declared it. Without a binding, the
 * endpoint rendered any registered island with caller-chosen props and none
 * of the declaring page's route middleware: an island declared on a gated page
 * answered anyone.
 *
 * So the SERVER signs every marker it renders: `HMAC-SHA256(secret,
 * [purpose, name, page, expiry, props])`, where `page` is the pathname of the
 * page that rendered the marker. The marker carries `data-page` and `data-sig`
 * (`<expiry ms>.<base64url MAC>`); the client sends them back unchanged. The
 * endpoint verifies before it decodes props or renders anything (a missing,
 * tampered or expired signature is a 403), and the route-middleware gate
 * matches the fragment request as `page` (`routingPathname`), so the declaring
 * page's auth runs for its fragments.
 *
 * Secret: `createServer({ serverIslands: { secret } })`, else the
 * `PYREON_ISLAND_SECRET` environment variable (comma-separated for rotation:
 * the first signs, every entry verifies), else a random secret generated once
 * per process. A per-process secret only verifies on the process that
 * rendered the page — a multi-instance deployment, or prerendered (SSG) pages,
 * must set the shared secret.
 *
 * Expiry: SSR and ISR renders sign for `maxAge` (default one day). ISR never
 * serves a cached page past half its signatures' lifetime (it re-renders
 * instead — see `islandSignaturesExpiring`). Prerendered pages sign with
 * expiry `0` (no expiry): the HTML is public and immutable until the next
 * build, so an expiry would only break it; rotate the secret to revoke.
 *
 * Web Crypto only — runs on Node, Bun, Deno and workerd.
 */
import { SERVER_ISLAND_MINT } from '@pyreon/server'
import type { Middleware, MiddlewareContext, ServerIslandMint } from '@pyreon/server'
import { fromB64url, normalizeSecrets, toB64url } from './utils/signed-cookie'

/** Environment variable holding the signing secret(s), comma-separated. */
export const ISLAND_SECRET_ENV = 'PYREON_ISLAND_SECRET'
/** Default signature lifetime for SSR / ISR renders, in seconds (one day). */
export const DEFAULT_ISLAND_SIGNATURE_MAX_AGE = 86_400
/**
 * Response header carrying the earliest signature expiry (ms since epoch) a
 * render minted. The ISR cache stores it with the entry and refuses to serve
 * the entry once half its lifetime is gone.
 */
export const ISLAND_EXPIRES_HEADER = 'x-pyreon-island-expires'

const PURPOSE = 'pyreon-island/1'
const enc = new TextEncoder()

export interface ServerIslandSignatureOptions {
  /**
   * Signing secret(s), each ≥ 32 characters. The first signs, every entry
   * verifies (rotate by prepending). Defaults to `PYREON_ISLAND_SECRET`, then
   * to a random per-process secret.
   */
  secret?: string | readonly string[]
  /** Signature lifetime for SSR / ISR renders, in seconds (default one day). */
  maxAge?: number
}

export interface IslandSigner {
  /** `<expiry>.<mac>` for one marker. `expiresAt` 0 means no expiry. */
  sign(name: string, page: string, props: string, expiresAt: number): Promise<string>
  /** Constant-time verification (`crypto.subtle.verify`) plus the expiry check. */
  verify(name: string, page: string, props: string, sig: string | null): Promise<boolean>
  /** Lifetime of a signature minted for an SSR / ISR render, in ms. */
  readonly maxAgeMs: number
}

type ProcessSecretHolder = { __PYREON_ISLAND_PROCESS_SECRET__?: Uint8Array<ArrayBuffer> }

/**
 * One random secret per process (globalThis-keyed: a production bundle can
 * hold two instances of this module, and the signer and the verifier must
 * agree). Bounded — a single 32-byte value, never a cache.
 */
function processSecret(): Uint8Array<ArrayBuffer> {
  const g = globalThis as ProcessSecretHolder
  if (!g.__PYREON_ISLAND_PROCESS_SECRET__) {
    const bytes = new Uint8Array(new ArrayBuffer(32))
    globalThis.crypto.getRandomValues(bytes)
    g.__PYREON_ISLAND_PROCESS_SECRET__ = bytes
  }
  return g.__PYREON_ISLAND_PROCESS_SECRET__
}

function envSecrets(): string[] | undefined {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    ISLAND_SECRET_ENV
  ]
  if (!raw) return undefined
  const list = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  return list.length > 0 ? list : undefined
}

/** True when the signer uses a secret shared across processes (config or env). */
export function hasSharedIslandSecret(options?: ServerIslandSignatureOptions): boolean {
  return options?.secret !== undefined || envSecrets() !== undefined
}

function message(name: string, page: string, expiresAt: number, props: string): Uint8Array<ArrayBuffer> {
  // JSON array: unambiguous field boundaries whatever the strings contain.
  return enc.encode(JSON.stringify([PURPOSE, name, page, expiresAt, props]))
}

export function createIslandSigner(options: ServerIslandSignatureOptions = {}): IslandSigner {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error(
      '[Pyreon] Server islands sign their fragments with Web Crypto (`globalThis.crypto.subtle`) — Node ≥ 18, Bun, Deno and workerd all provide it.',
    )
  }
  const configured = options.secret ?? envSecrets()
  const rawKeys: Uint8Array<ArrayBuffer>[] = configured
    ? normalizeSecrets(configured, 'serverIslands').map((s) => enc.encode(s))
    : [processSecret()]
  // Imported keys are cached per signer (bounded by the secret count).
  const keys = rawKeys.map((k) =>
    subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
  )
  const maxAge = options.maxAge ?? DEFAULT_ISLAND_SIGNATURE_MAX_AGE
  if (!(maxAge > 0) || !Number.isFinite(maxAge)) {
    throw new Error(`[Pyreon] serverIslands.maxAge must be a positive number of seconds (got ${String(maxAge)}).`)
  }

  return {
    maxAgeMs: maxAge * 1000,
    async sign(name, page, props, expiresAt) {
      const mac = new Uint8Array(await subtle.sign('HMAC', await keys[0]!, message(name, page, expiresAt, props)))
      return `${expiresAt}.${toB64url(mac)}`
    },
    async verify(name, page, props, sig) {
      if (!sig) return false
      const dot = sig.indexOf('.')
      if (dot <= 0 || dot > 16) return false
      const expRaw = sig.slice(0, dot)
      if (!/^\d+$/.test(expRaw)) return false
      const expiresAt = Number(expRaw)
      if (expiresAt !== 0 && expiresAt < Date.now()) return false
      const mac = fromB64url(sig.slice(dot + 1))
      if (!mac || mac.length !== 32) return false
      const data = message(name, page, expiresAt, props)
      for (const key of keys) {
        if (await subtle.verify('HMAC', await key, mac, data)) return true
      }
      return false
    },
  }
}

let warnedProcessSecret = false

/**
 * A mint bound to one page: what the `serverIsland()` marker calls while it
 * renders on the server. `expiresAt` 0 signs without expiry (prerender).
 */
export function createIslandMint(
  signer: IslandSigner,
  page: string,
  options: { expiresAt?: number; headers?: () => Headers; sharedSecret?: boolean } = {},
): ServerIslandMint {
  return async (name, props) => {
    if (
      options.sharedSecret === false
      && !warnedProcessSecret
      && process.env.NODE_ENV === 'production'
    ) {
      warnedProcessSecret = true
      // oxlint-disable-next-line no-console
      console.warn(
        `[Pyreon] Server island "${name}" was signed with a per-process secret, so its fragment only verifies on this server process. `
        + `Set ${ISLAND_SECRET_ENV} (or createServer({ serverIslands: { secret } })) when more than one instance serves the app.`,
      )
    }
    const expiresAt = options.expiresAt ?? Date.now() + signer.maxAgeMs
    const headers = options.headers?.()
    if (expiresAt !== 0 && headers) {
      const prev = Number(headers.get(ISLAND_EXPIRES_HEADER))
      if (!(prev > 0) || expiresAt < prev) headers.set(ISLAND_EXPIRES_HEADER, String(expiresAt))
    }
    return { page, sig: await signer.sign(name, page, props, expiresAt) }
  }
}

/**
 * Pipeline middleware: give every request a mint bound to its own pathname,
 * so any page it renders signs its server-island markers. The fragment
 * endpoint replaces it with one bound to the VERIFIED page for nested renders.
 */
export function createIslandMintMiddleware(
  signer: IslandSigner,
  sharedSecret: boolean,
): Middleware {
  return (ctx: MiddlewareContext) => {
    // The full pathname, base and locale included — what the browser shows
    // and what route middleware is matched against (after the same stripping
    // as the page request itself, in `routingPathname`). This middleware runs
    // first, before any base stripping rewrites `ctx.url`.
    const page = ctx.url.pathname
    ctx.locals[SERVER_ISLAND_MINT] = createIslandMint(signer, page, {
      // Read at mint time: the response headers are whatever `ctx.headers`
      // is when the page renders.
      headers: () => ctx.headers,
      sharedSecret,
    })
  }
}

/**
 * ISR: true when a cached entry's server-island signatures are past half
 * their lifetime, so the entry must be re-rendered rather than served (its
 * visitors need time to fetch their fragments before the signatures expire).
 */
export function islandSignaturesExpiring(
  headers: Record<string, string> | undefined,
  storedAt: number,
  now: number = Date.now(),
): boolean {
  const raw = headers?.[ISLAND_EXPIRES_HEADER]
  if (!raw) return false
  const expiresAt = Number(raw)
  if (!(expiresAt > 0)) return false
  return expiresAt - now < (expiresAt - storedAt) / 2
}

let warnedUnsignedPrerender = false

/**
 * Request locals for a PRERENDERED (SSG) page: a mint that signs its
 * server-island markers without expiry, for the page's public pathname
 * (`base` + `path`). The runtime server must verify with the same secret, so
 * prerendering signs only with a SHARED secret (`PYREON_ISLAND_SECRET` at
 * build time); without one, markers stay unsigned and the build warns once —
 * their fragments would be refused (403) by any server.
 */
export function prerenderServerIslandLocals(path: string, base?: string): Record<string, unknown> {
  const q = path.search(/[?#]/)
  const pathname = q === -1 ? path : path.slice(0, q)
  const prefix = base && base !== '/' ? base.replace(/\/+$/, '') : ''
  const page = `${prefix}${pathname}` || '/'
  if (!hasSharedIslandSecret()) {
    const unsigned: ServerIslandMint = async (name) => {
      if (!warnedUnsignedPrerender) {
        warnedUnsignedPrerender = true
        // oxlint-disable-next-line no-console
        console.warn(
          `[Pyreon] Prerendered page ${page} contains server island "${name}", but ${ISLAND_SECRET_ENV} is not set at build time, so its marker is unsigned and the fragment endpoint will refuse it (403). `
          + `Set ${ISLAND_SECRET_ENV} to the same value at build time and on the server.`,
        )
      }
      return null
    }
    return { [SERVER_ISLAND_MINT]: unsigned }
  }
  return { [SERVER_ISLAND_MINT]: createIslandMint(createIslandSigner(), page, { expiresAt: 0 }) }
}
