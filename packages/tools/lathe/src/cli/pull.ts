/**
 * `lathe pull` — fetch a remote spec INTO the repo.
 *
 * ## Why this is its own file
 *
 * Writing a fetched HTTP body to disk is what this function is FOR, and CodeQL
 * reports it (`js/http-to-file-access`) because remote data reaches the file
 * system. That is a true observation, not a false positive: the risk is real
 * and it is ACCEPTED, because a tool whose job is "fetch a spec and save it"
 * cannot avoid it. Isolating it here keeps the exclusion to one small file with
 * a stated rationale instead of un-scanning the whole CLI — the same shape the
 * existing entries in `.github/codeql/codeql-config.yml` use.
 *
 * ## What bounds the accepted risk
 *
 * The mitigations are what make it acceptable rather than merely unavoidable,
 * and each closes a specific thing that could otherwise go wrong:
 *
 *   - The DESTINATION comes from the project's own config, never from the
 *     response. No header, redirect or body can steer the write, so there is no
 *     path traversal to have.
 *   - The body is capped. An unbounded `res.text()` on a hostile or
 *     misconfigured URL is a memory-exhaustion bug regardless of what CodeQL
 *     thinks of it.
 *   - It must PARSE, and it must parse as an OPENAPI document — not merely as
 *     valid YAML. A proxy error page, a login redirect or a truncated body is
 *     rejected before anything is written, so a transient network problem
 *     cannot become a committed one.
 *   - Nothing is executed. The bytes are written, and read back by the
 *     generator as data.
 *
 * The user runs this deliberately, against a URL they typed, in a developer
 * tool — the trust model of `curl -o`, with more validation than `curl` does.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stringify } from 'yaml'
import { bundle, collectDocumentsAsync, referencedDocuments, type ReadOutcome } from '../input/bundle'
import { openApiVersionProblem } from '../input/openapi'
import { parseSpecText } from '../input/yaml'

import { createTerm, finding, type Term } from '@pyreon/ansi'

/**
 * A pull failure on stderr in the shared theme: `✗ lathe pull · <problem>`,
 * any further lines of the message kept as they are underneath (they carry
 * the per-document reasons), then `fix:` when there is one.
 */
function fail(message: string, fix?: string): 1 {
  const t = createTerm({ isTTY: Boolean(process.stderr.isTTY) })
  const [first = '', ...rest] = message.replace(/\n$/, '').split('\n')
  const lines = finding(
    t,
    { severity: 'error', source: 'lathe pull', message: first.replace(/^\[Pyreon\] lathe: /, ''), fix },
    { indent: 0, width: t.width },
  )
  // Detail lines go between the headline and `fix:`.
  const fixAt = fix ? lines.length - 1 : lines.length
  lines.splice(fixAt, 0, ...rest.map((l) => `   ${l.replace(/^ {2}/, '')}`))
  process.stderr.write(`${lines.join('\n')}\n`)
  return 1
}

const termOf = (color: PullOptions['color']): Term =>
  createTerm({ level: color === true ? 1 : color === false || color === undefined ? 0 : color })

/**
 * Largest spec accepted, in bytes.
 *
 * Generous — GitHub's own OpenAPI document is ~13 MB, and refusing a real spec
 * would be a worse failure than the one this prevents — but bounded, so a URL
 * that streams forever cannot exhaust memory.
 */
const MAX_BYTES = 64 * 1024 * 1024

/** Read a response body with a hard ceiling, rather than trusting its length. */
async function readCapped(res: Response): Promise<string | undefined> {
  // Two different defences, because the header covers only one case.
  //
  // An HONEST oversized `content-length` is rejected here, from the header
  // alone, without reading a byte. But the header is optional: a CHUNKED
  // response declares no length at all, and that is the case the streaming cap
  // below exists for. (A LYING small length needs no defence — a compliant
  // client truncates the body at the declared value, so the oversized stream
  // behind it never arrives.)
  const declared = Number(res.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_BYTES) return undefined
  if (!res.body) return res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > MAX_BYTES) {
        await reader.cancel()
        return undefined
      }
      chunks.push(value)
    }
  }
  const joined = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    joined.set(c, at)
    at += c.length
  }
  return new TextDecoder().decode(joined)
}


/** How long to wait for a spec URL before giving up. */
const PULL_TIMEOUT_MS = 30_000

export interface PullOptions {
  /**
   * Request headers -- an `Authorization` for a spec behind auth. Values are
   * never written anywhere: not to the cache, not to the output.
   */
  headers?: Record<string, string> | undefined
  /**
   * Directory for the conditional-request cache. When set, the response's
   * `ETag` / `Last-Modified` is recorded against the destination, and the next
   * pull sends `If-None-Match` / `If-Modified-Since` -- but ONLY when the file
   * on disk is still byte-identical to what was fetched, so a spec edited
   * locally is always re-downloaded rather than "confirmed unchanged".
   */
  cacheDir?: string | undefined
  /**
   * Where the progress lines go (default: stdout). `lathe init --json` sends
   * them to stderr so stdout stays one JSON document.
   */
  out?: ((text: string) => void) | undefined
  /** Colour the output: `true` sixteen colours, or a level (0 plain … 3 truecolor). */
  color?: boolean | 0 | 1 | 2 | 3 | undefined
  /**
   * Other origins a referenced document may be fetched from -- see
   * `LatheSection.refOrigins`. By default a document's `$ref`s (and their
   * redirects) stay on that document's own origin.
   */
  refOrigins?: readonly string[] | undefined
}

interface CacheEntry {
  url: string
  sha256: string
  etag?: string | undefined
  lastModified?: string | undefined
  /**
   * The destination holds a BUNDLE of several fetched documents, so its bytes
   * are not the root's and the root's validators say nothing about them:
   * the root is re-fetched and each referenced document is conditional on
   * its own entry.
   */
  bundled?: boolean | undefined
}

function readCache(file: string | undefined): Record<string, CacheEntry> {
  if (!file) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, CacheEntry>) : {}
  } catch {
    return {}
  }
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** Fetch `url` and write it to `dest`. Returns a process exit code. */
export async function pullSpec(url: string, dest: string, opts: PullOptions = {}): Promise<number> {
  const t = termOf(opts.color)
  const write = opts.out ?? ((text: string): void => void process.stdout.write(text))
  const cacheFile = opts.cacheDir ? join(opts.cacheDir, 'pull-cache.json') : undefined
  const cache = readCache(cacheFile)
  let onDisk: string | undefined
  try {
    onDisk = readFileSync(dest, 'utf8')
  } catch {
    onDisk = undefined
  }
  const cached = cache[dest]
  const conditional: Record<string, string> = {}
  const unedited = cached !== undefined && cached.url === url && onDisk !== undefined && sha256(onDisk) === cached.sha256
  // A BUNDLED destination is not the root's bytes, so its validators live on
  // the root's own document-cache entry, with the body kept beside it: a 304
  // is answered from that body and the bundle is rebuilt from it (each part
  // conditional on its own entry), rather than "confirmed" wholesale -- a
  // referenced part can change while the root does not.
  const rootEntry = cache[`doc:${url}`]
  const rootCachedBody = unedited && cached?.bundled && rootEntry ? readCachedBody(cacheFile, url, rootEntry) : undefined
  const validators = cached?.bundled ? (rootCachedBody !== undefined ? rootEntry : undefined) : unedited ? cached : undefined
  if (validators?.etag) conditional['if-none-match'] = validators.etag
  if (validators?.lastModified) conditional['if-modified-since'] = validators.lastModified

  let res: Response
  try {
    // A deadline, not just a catch. Without a signal a server that accepts the
    // connection and then never answers hangs this CLI forever, with no output
    // and nothing to interrupt — the failure mode `no-untimed-raw-fetch` names.
    res = await fetch(url, {
      headers: { ...opts.headers, ...conditional },
      signal: AbortSignal.timeout(PULL_TIMEOUT_MS),
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    return fail(
      timedOut
        ? `${url} did not respond within ${PULL_TIMEOUT_MS / 1000}s`
        : `could not reach ${url}\n  ${err instanceof Error ? err.message : String(err)}`,
      'check the URL and your network, then run lathe pull again',
    )
  }
  if (res.status === 304 && rootCachedBody === undefined) {
    write(`  ${t.ok(t.sym('ok'))} spec unchanged  ${t.underline(dest)} ${t.dim(`${t.sym('bullet')} 304 Not Modified`)}\n`)
    return 0
  }
  if (!res.ok && res.status !== 304) {
    const auth = res.status === 401 || res.status === 403
    return fail(
      `${url} responded ${res.status} ${res.statusText}`,
      auth ? 'the spec is behind auth: pass `--token <token>` (or set LATHE_TOKEN), or `--header "Name: value"`' : undefined,
    )
  }
  const body = res.status === 304 ? rootCachedBody : await readCapped(res)
  if (body === undefined) {
    return fail(`${url} returned more than ${MAX_BYTES / 1024 / 1024} MB, so nothing was written.`)
  }
  let parsed: unknown
  try {
    parsed = parseSpecText(body)
  } catch (err) {
    return fail(
      `${url} did not return a parseable spec, so nothing was written.\n  ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  // "It parsed as YAML" is a much weaker statement than it sounds: an HTML
  // error page fails, but a plain-text one, a JSON error envelope, or somebody's
  // CI config all parse fine and would then be written over a working spec. The
  // rule is the one `generate` applies, so a spec `pull` accepts is one
  // `generate` reads -- it used to accept Swagger 2, which generate then turned
  // into an empty client.
  const problem = openApiVersionProblem(parsed)
  if (problem) {
    return fail(`${problem.replace('[Pyreon] lathe: ', `${url}: `)}\n  Nothing was written.`)
  }

  // A spec split across files: fetch every document it references -- with the
  // same headers and per-document ETag cache -- and write ONE bundled
  // document, so `generate` stays offline and deterministic.
  let written = body
  let bundledCount = 0
  const refs = referencedDocuments(parsed, url)
  if (refs.length > 0) {
    const rootOrigin = new URL(url).origin
    const read = documentFetcher(
      cache,
      cacheFile,
      (id) => (new URL(id).origin === rootOrigin ? opts.headers : undefined),
      refOriginPolicy(opts.refOrigins),
    )
    const docs = await collectDocumentsAsync(parsed, url, read)
    const failed = [...docs].filter((entry): entry is [string, { error: string }] => 'error' in entry[1])
    if (failed.length > 0) {
      return fail(
        `${url} references ${failed.length} document(s) that could not be fetched, so nothing was written:\n` +
          failed.map(([id, o]) => `  ${id}: ${o.error}`).join('\n'),
      )
    }
    const bundled = bundle(url, docs)
    written = /\.json$/i.test(dest) ? `${JSON.stringify(bundled.doc, null, 2)}\n` : stringify(bundled.doc, { lineWidth: 0 })
    bundledCount = bundled.documents.length
  }

  mkdirSync(dirname(dest), { recursive: true })
  // The file was read WITHOUT an `existsSync` check first (above). The
  // check-then-write pair is a time-of-check/time-of-use race (CodeQL
  // `js/file-system-race`), and the existence test is redundant anyway: a
  // missing file is just a read that throws ENOENT, which this handles.
  const previous = onDisk
  if (previous !== written) writeFileSync(dest, written, 'utf8')
  // Recorded only once the bytes on disk are the bytes fetched, so a
  // conditional request can never "confirm" a file the server never sent.
  if (cacheFile) {
    const etag = res.headers.get('etag') ?? undefined
    const lastModified = res.headers.get('last-modified') ?? undefined
    if (bundledCount > 0) {
      cache[dest] = { url, sha256: sha256(written), bundled: true }
      if (res.status !== 304 && (etag || lastModified)) storeBody(cacheFile, cache, url, body, etag, lastModified)
    }
    else if (etag || lastModified) cache[dest] = { url, sha256: sha256(body), etag, lastModified }
    writeCache(cacheFile, cache)
  }
  const bundledNote = bundledCount > 0 ? `bundled from ${bundledCount} documents` : ''
  const b = t.sym('bullet')
  if (previous === written) {
    write(`  ${t.ok(t.sym('ok'))} spec unchanged  ${t.underline(dest)}${bundledNote ? ` ${t.dim(`${b} ${bundledNote}`)}` : ''}\n`)
    return 0
  }
  const advice = relativeServerAdvice(parsed, url)
  write(
    `  ${t.ok(t.sym('ok'))} ${previous === undefined ? 'fetched' : 'updated'}  ${t.underline(dest)} ${t.dim(
      `${b} ${written.length} bytes${bundledNote ? ` ${b} ${bundledNote}` : ''}`,
    )}\n` +
      (advice ? `    ${t.info(t.sym('info'))} ${advice.trim().replace(/\n\s+/g, ' ')}\n` : '') +
      `    ${t.dim('next:')} review the diff, then run lathe generate\n`,
  )
  return 0
}

function writeCache(cacheFile: string, cache: Record<string, CacheEntry>): void {
  try {
    mkdirSync(dirname(cacheFile), { recursive: true })
    writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  } catch {
    // A cache that cannot be written costs one full download next time.
  }
}

/** The cached body of a fetched document, when it is still the bytes recorded. */
function readCachedBody(cacheFile: string | undefined, id: string, entry: CacheEntry): string | undefined {
  if (!cacheFile) return undefined
  try {
    const text = readFileSync(join(dirname(cacheFile), 'docs', sha256(id)), 'utf8')
    return sha256(text) === entry.sha256 ? text : undefined
  } catch {
    return undefined
  }
}

/** Keep a fetched document's body and validators, for the next conditional request. */
function storeBody(
  cacheFile: string,
  cache: Record<string, CacheEntry>,
  id: string,
  text: string,
  etag: string | undefined,
  lastModified: string | undefined,
): void {
  try {
    const file = join(dirname(cacheFile), 'docs', sha256(id))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text, 'utf8')
    cache[`doc:${id}`] = { url: id, sha256: sha256(text), etag, lastModified }
  } catch {
    // Uncached: the next run downloads it again.
  }
}

/**
 * A reader for the documents a spec references, for bundling -- shared by
 * `lathe pull` and by `generate` with `remoteRefs: 'fetch'`.
 *
 * `headersFor(id)` decides which credentials a document receives. Both callers
 * scope them to an ORIGIN: a spec can reference any URL, and forwarding a
 * credential to wherever its `$ref`s point would hand the token to a third
 * party the user never named.
 *
 * Each document is conditional on its own cache entry (`docs/<sha256 of the
 * url>` beside the index), so a `304` is answered from disk. A non-http id --
 * a `file://` in a downloaded spec -- is refused: remote content never makes
 * this read the local disk.
 *
 * `allow(target, from)` decides which URLs a document may make this fetch --
 * checked for the reference itself and again for every redirect hop, which
 * are followed by hand so a same-origin URL cannot bounce the request to an
 * internal address. See {@link refOriginPolicy}.
 */
export function documentFetcher(
  cache: Record<string, CacheEntry>,
  cacheFile: string | undefined,
  headersFor: (id: string) => Record<string, string> | undefined,
  allow: (target: string, from: string) => string | undefined = refOriginPolicy(undefined),
): (id: string, from?: string) => Promise<ReadOutcome> {
  return async (id, from) => {
    if (!/^https?:\/\//i.test(id)) {
      return { error: 'a remote spec can only reference other http(s) documents, not local files.' }
    }
    if (from !== undefined) {
      const refused = allow(id, from)
      if (refused) return { error: refused }
    }
    const entry = cache[`doc:${id}`]
    const cachedBody = entry ? readCachedBody(cacheFile, id, entry) : undefined
    const conditional: Record<string, string> = {}
    if (entry && cachedBody !== undefined) {
      if (entry.etag) conditional['if-none-match'] = entry.etag
      if (entry.lastModified) conditional['if-modified-since'] = entry.lastModified
    }
    let res: Response
    let at = id
    try {
      for (let hops = 0; ; hops++) {
        res = await fetch(at, {
          headers: { ...headersFor(at), ...conditional },
          redirect: 'manual',
          signal: AbortSignal.timeout(PULL_TIMEOUT_MS),
        })
        const location = res.status >= 300 && res.status < 400 && res.status !== 304 ? res.headers.get('location') : null
        if (location === null) break
        if (hops >= MAX_REDIRECTS) return { error: `more than ${MAX_REDIRECTS} redirects` }
        const next = new URL(location, at).href
        if (!/^https?:\/\//i.test(next)) return { error: `redirected to ${next}, which is not an http(s) URL` }
        const refused = allow(next, at)
        if (refused) return { error: `redirected: ${refused}` }
        at = next
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
    let text: string | undefined
    if (res.status === 304 && cachedBody !== undefined) text = cachedBody
    else if (!res.ok) return { error: `responded ${res.status} ${res.statusText}` }
    else {
      text = await readCapped(res)
      if (text === undefined) return { error: `larger than ${MAX_BYTES / 1024 / 1024} MB` }
      const etag = res.headers.get('etag') ?? undefined
      const lastModified = res.headers.get('last-modified') ?? undefined
      if (cacheFile && (etag || lastModified)) storeBody(cacheFile, cache, id, text, etag, lastModified)
    }
    try {
      return { doc: parseSpecText(text) }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }
}

/** How many redirects one referenced document may take. */
const MAX_REDIRECTS = 5

/**
 * Which URLs a document may make lathe fetch -- shared by `lathe pull` and
 * `remoteRefs: 'fetch'`.
 *
 * A remote spec is someone else's input, and following its `$ref`s to any
 * host made lathe a request forwarder: `$ref: http://169.254.169.254/...`
 * fetched a cloud metadata endpoint from the developer's machine (or CI
 * runner) and bundled the response into the written spec. So a REMOTE
 * document may reference only its own origin, plus the origins in
 * `refOrigins`. `'*'` there allows any origin except a loopback, private or
 * link-local address -- unless the referencing document is itself served
 * from one (a spec on `localhost` referencing its siblings). A LOCAL
 * document is the user's own file and may name any URL.
 */
export function refOriginPolicy(refOrigins: readonly string[] | undefined): (target: string, from: string) => string | undefined {
  const named = new Set((refOrigins ?? []).filter((o) => o !== '*').map((o) => new URL(o).origin))
  const any = (refOrigins ?? []).includes('*')
  return (target, from) => {
    if (!/^https?:\/\//i.test(from)) return undefined
    const t = new URL(target)
    const f = new URL(from)
    if (t.origin === f.origin || named.has(t.origin)) return undefined
    if (any && (!isInternalHost(t.hostname) || isInternalHost(f.hostname))) return undefined
    const why = any ? `${t.origin} is a loopback, private or link-local address` : `it leaves ${f.origin} for ${t.origin}`
    return (
      `[Pyreon] lathe: ${from} references ${target}, which is refused: ${why}. ` +
      `A remote spec may only reference its own origin unless you allow another -- \`refOrigins: ['${t.origin}']\` in the lathe config, or \`--ref-origin ${t.origin}\` for \`lathe pull\`.`
    )
  }
}

/**
 * Whether a URL's hostname is a loopback, private, link-local or otherwise
 * internal LITERAL address (or `localhost`). Names that only RESOLVE to such
 * an address are not caught -- that needs DNS -- which is why the default is
 * same-origin, and this check only narrows `refOrigins: ['*']`.
 */
export function isInternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h === '') return true
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h)
  if (v4) return internalV4(v4.slice(1).map(Number))
  if (!h.includes(':')) return false
  // IPv6, as the URL parser serializes it (compressed, lowercase hex).
  if (h === '::' || h === '::1') return true
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h)
  if (mapped) {
    const hi = parseInt(mapped[1] as string, 16)
    const lo = parseInt(mapped[2] as string, 16)
    return internalV4([hi >> 8, hi & 255, lo >> 8, lo & 255])
  }
  const first = parseInt(h.split(':')[0] || '0', 16)
  // fc00::/7 unique-local, fe80::/10 link-local.
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
}

function internalV4([a, b]: number[]): boolean {
  const x = a as number
  const y = b as number
  return (
    x === 0 || x === 10 || x === 127 ||
    (x === 100 && y >= 64 && y <= 127) ||
    (x === 169 && y === 254) ||
    (x === 172 && y >= 16 && y <= 31) ||
    (x === 192 && y === 168)
  )
}

/** The document cache index under `cacheDir`, and a function persisting it. */
export function documentCache(cacheDir: string | undefined): {
  cache: Record<string, CacheEntry>
  cacheFile: string | undefined
  save(): void
} {
  const cacheFile = cacheDir ? join(cacheDir, 'pull-cache.json') : undefined
  const cache = readCache(cacheFile)
  return { cache, cacheFile, save: () => (cacheFile ? writeCache(cacheFile, cache) : undefined) }
}

/**
 * A RELATIVE `servers[0].url` means "relative to where the spec was served",
 * and `pull` is the only step that knows where that was -- once the file is on
 * disk the origin is gone. The spec is written byte-for-byte (rewriting a
 * vendor's file would make the next pull a spurious diff), so the resolved URL
 * is printed as the `baseUrl` to configure instead.
 */
export function relativeServerAdvice(parsed: unknown, specUrl: string): string {
  const servers = (parsed as { servers?: unknown }).servers
  const first = Array.isArray(servers) ? (servers[0] as { url?: unknown } | undefined) : undefined
  const url = typeof first?.url === 'string' ? first.url : undefined
  if (!url || /^[a-z][a-z\d+.-]*:/i.test(url) || url.includes('{')) return ''
  let resolved: string
  try {
    resolved = new URL(url, specUrl).href.replace(/\/$/, '')
  } catch {
    return ''
  }
  return (
    `  servers[0].url \`${url}\` is relative to the spec's URL, so it means ${resolved}.\n` +
    `  Set \`lathe: { baseUrl: '${resolved}' }\` so the client (and native) use it.\n`
  )
}
