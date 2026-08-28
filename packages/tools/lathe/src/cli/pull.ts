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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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

/**
 * True when the parsed document actually claims to be an OpenAPI spec.
 *
 * "It parsed as YAML" is a much weaker statement than it sounds: an HTML error
 * page fails, but a plain-text one, a JSON error envelope, or somebody's CI
 * config all parse fine and would then be written over a working spec.
 */
function looksLikeSpec(parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== 'object') return false
  const doc = parsed as Record<string, unknown>
  return typeof doc.openapi === 'string' || typeof doc.swagger === 'string'
}

/** How long to wait for a spec URL before giving up. */
const PULL_TIMEOUT_MS = 30_000

/** Fetch `url` and write it to `dest`. Returns a process exit code. */
export async function pullSpec(url: string, dest: string): Promise<number> {
  let res: Response
  try {
    // A deadline, not just a catch. Without a signal a server that accepts the
    // connection and then never answers hangs this CLI forever, with no output
    // and nothing to interrupt — the failure mode `no-untimed-raw-fetch` names.
    res = await fetch(url, { signal: AbortSignal.timeout(PULL_TIMEOUT_MS) })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    process.stderr.write(
      timedOut
        ? `[Pyreon] lathe: ${url} did not respond within ${PULL_TIMEOUT_MS / 1000}s\n`
        : `[Pyreon] lathe: could not reach ${url}\n  ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 1
  }
  if (!res.ok) {
    process.stderr.write(`[Pyreon] lathe: ${url} responded ${res.status} ${res.statusText}\n`)
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
  if (!looksLikeSpec(parsed)) {
    process.stderr.write(
      `[Pyreon] lathe: ${url} parsed, but carries no \`openapi\` or \`swagger\` version key,\n` +
        '  so it is not an OpenAPI document. Nothing was written.\n',
    )
    return 1
  }

  mkdirSync(dirname(dest), { recursive: true })
  // Read WITHOUT an `existsSync` check first. The check-then-write pair is a
  // time-of-check/time-of-use race (CodeQL `js/file-system-race`), and the
  // existence test is redundant anyway: a missing file is just a read that
  // throws ENOENT, which this already has to handle.
  let previous: string | undefined
  try {
    previous = readFileSync(dest, 'utf8')
  } catch {
    previous = undefined
  }
  if (previous === body) {
    process.stdout.write(`  spec unchanged  ${dest}\n`)
    return 0
  }
  writeFileSync(dest, body, 'utf8')
  process.stdout.write(
    `  ${previous === undefined ? 'fetched' : 'updated'}  ${dest}  ${DIM}${body.length} bytes${RESET}\n` +
      '  Review the diff, then run `lathe generate`.\n',
  )
  return 0
}
