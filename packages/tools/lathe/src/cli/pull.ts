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
import { openApiVersionProblem } from '../input/openapi'
import { parseSpecText } from '../input/yaml'

// Built rather than written literally, matching `report.ts`: a raw ESC byte in
// source is invisible in diffs and review, and trivially lost to a formatter.
const ESC = String.fromCharCode(27)
const DIM = ESC + '[2m'
const RESET = ESC + '[0m'

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
  /** Colour the output. */
  color?: boolean | undefined
}

interface CacheEntry {
  url: string
  sha256: string
  etag?: string | undefined
  lastModified?: string | undefined
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
  const dim = (s: string): string => (opts.color ? `${DIM}${s}${RESET}` : s)
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
  if (cached && cached.url === url && onDisk !== undefined && sha256(onDisk) === cached.sha256) {
    if (cached.etag) conditional['if-none-match'] = cached.etag
    if (cached.lastModified) conditional['if-modified-since'] = cached.lastModified
  }

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
    process.stderr.write(
      timedOut
        ? `[Pyreon] lathe: ${url} did not respond within ${PULL_TIMEOUT_MS / 1000}s\n`
        : `[Pyreon] lathe: could not reach ${url}\n  ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 1
  }
  if (res.status === 304) {
    process.stdout.write(`  spec unchanged  ${dest}  ${dim('304 Not Modified')}\n`)
    return 0
  }
  if (!res.ok) {
    const auth = res.status === 401 || res.status === 403
    process.stderr.write(
      `[Pyreon] lathe: ${url} responded ${res.status} ${res.statusText}\n` +
        (auth
          ? '  The spec is behind auth. Pass `--token <token>` (or set LATHE_TOKEN), or `--header "Name: value"`.\n'
          : ''),
    )
    return 1
  }
  const body = await readCapped(res)
  if (body === undefined) {
    process.stderr.write(
      `[Pyreon] lathe: ${url} returned more than ${MAX_BYTES / 1024 / 1024} MB, so nothing was written.\n`,
    )
    return 1
  }
  let parsed: unknown
  try {
    parsed = parseSpecText(body)
  } catch (err) {
    process.stderr.write(
      `[Pyreon] lathe: ${url} did not return a parseable spec, so nothing was written.\n` +
        `  ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 1
  }
  // "It parsed as YAML" is a much weaker statement than it sounds: an HTML
  // error page fails, but a plain-text one, a JSON error envelope, or somebody's
  // CI config all parse fine and would then be written over a working spec. The
  // rule is the one `generate` applies, so a spec `pull` accepts is one
  // `generate` reads -- it used to accept Swagger 2, which generate then turned
  // into an empty client.
  const problem = openApiVersionProblem(parsed)
  if (problem) {
    process.stderr.write(`${problem.replace('[Pyreon] lathe: ', `[Pyreon] lathe: ${url}: `)}\n  Nothing was written.\n`)
    return 1
  }

  mkdirSync(dirname(dest), { recursive: true })
  // The file was read WITHOUT an `existsSync` check first (above). The
  // check-then-write pair is a time-of-check/time-of-use race (CodeQL
  // `js/file-system-race`), and the existence test is redundant anyway: a
  // missing file is just a read that throws ENOENT, which this handles.
  const previous = onDisk
  if (previous !== body) writeFileSync(dest, body, 'utf8')
  // Recorded only once the bytes on disk are the bytes fetched, so a
  // conditional request can never "confirm" a file the server never sent.
  if (cacheFile) {
    const etag = res.headers.get('etag') ?? undefined
    const lastModified = res.headers.get('last-modified') ?? undefined
    if (etag || lastModified) {
      cache[dest] = { url, sha256: sha256(body), etag, lastModified }
      try {
        mkdirSync(dirname(cacheFile), { recursive: true })
        writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
      } catch {
        // A cache that cannot be written costs one full download next time.
      }
    }
  }
  if (previous === body) {
    process.stdout.write(`  spec unchanged  ${dest}\n`)
    return 0
  }
  process.stdout.write(
    `  ${previous === undefined ? 'fetched' : 'updated'}  ${dest}  ${dim(`${body.length} bytes`)}\n` +
      '  Review the diff, then run `lathe generate`.\n' +
      relativeServerAdvice(parsed, url),
  )
  return 0
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
