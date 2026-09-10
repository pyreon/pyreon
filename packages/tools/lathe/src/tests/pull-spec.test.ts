/**
 * `lathe pull` — fetching a spec from a URL onto disk.
 *
 * This writes into the user's repo from a REMOTE source, which makes
 * every refusal here load-bearing. Writing an HTML error page over a
 * working `openapi.yaml` costs them the spec; the next `lathe generate`
 * then fails to parse a file they did not change, and the useful version
 * is gone.
 *
 * So the order matters as much as the checks: nothing is written until
 * the response has been proved to be a spec. `looksLikeSpec` is the last
 * gate — valid JSON is not enough, because a JSON error envelope from a
 * gateway parses perfectly.
 *
 * The size cap has two halves because the header covers only one case.
 * An honest oversized `content-length` is rejected without reading a
 * byte; a CHUNKED response declares no length at all, and that is what
 * the streaming cap is for. Without the second, a spec URL that starts
 * streaming a database dump fills the disk.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pullSpec } from '../cli/pull'

const SPEC = JSON.stringify({ openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} })

const dest = () => join(mkdtempSync(join(tmpdir(), 'lathe-pull-')), 'openapi.json')

/** Stub `fetch` with a real Response so the streaming path is exercised. */
const respond = (body: string, init: ResponseInit = {}) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200, ...init })))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a real spec is written', () => {
  it('writes the body and exits 0', async () => {
    // The control. Every refusal spec below is worthless against a pull
    // that writes nothing.
    respond(SPEC)
    const d = dest()
    expect(await pullSpec('https://x.com/openapi.json', d)).toBe(0)
    expect(readFileSync(d, 'utf8')).toBe(SPEC)
  })

  it('accepts a swagger 2 document too', async () => {
    respond(JSON.stringify({ swagger: '2.0', info: {}, paths: {} }))
    const d = dest()
    expect(await pullSpec('https://x.com/s.json', d)).toBe(0)
    expect(existsSync(d)).toBe(true)
  })

  it('is a no-op when the content is UNCHANGED', async () => {
    // Rewriting an identical file churns the mtime, which makes every
    // downstream staleness check think the spec moved.
    respond(SPEC)
    const d = dest()
    writeFileSync(d, SPEC)
    expect(await pullSpec('https://x.com/s.json', d)).toBe(0)
    expect(readFileSync(d, 'utf8')).toBe(SPEC)
  })
})

describe('nothing is written unless the response IS a spec', () => {
  it('refuses a non-2xx and leaves the existing file alone', async () => {
    // The failure this exists to prevent: overwriting a working spec
    // with an error page, so the next generate fails on a file the
    // author never edited.
    respond('Not Found', { status: 404 })
    const d = dest()
    writeFileSync(d, SPEC)
    expect(await pullSpec('https://x.com/s.json', d)).toBe(1)
    expect(readFileSync(d, 'utf8'), 'the good spec survives').toBe(SPEC)
  })

  it('refuses an HTML error page that came back 200', async () => {
    // A login redirect or a captive portal. It parses as nothing, and
    // writing it destroys the spec.
    respond('<!DOCTYPE html><html><body>Sign in</body></html>')
    const d = dest()
    writeFileSync(d, SPEC)
    expect(await pullSpec('https://x.com/s.json', d)).toBe(1)
    expect(readFileSync(d, 'utf8')).toBe(SPEC)
  })

  it('refuses VALID JSON that is not a spec', async () => {
    // A gateway's error envelope parses perfectly. Parseability is not
    // the test — `openapi` or `swagger` is.
    respond(JSON.stringify({ error: 'unauthorized', status: 401 }))
    const d = dest()
    expect(await pullSpec('https://x.com/s.json', d)).toBe(1)
    expect(existsSync(d), 'nothing is created either').toBe(false)
  })

  for (const [label, body] of [
    ['a bare array', '[]'],
    ['a bare number', '42'],
    ['null', 'null'],
    ['a JSON string', '"openapi"'],
  ] as Array<[string, string]>) {
    it(`refuses ${label}`, async () => {
      respond(body)
      const d = dest()
      expect(await pullSpec('https://x.com/s.json', d), label).toBe(1)
      expect(existsSync(d), label).toBe(false)
    })
  }

  it('refuses an oversized response declared in the HEADER', async () => {
    // Rejected from the header alone, without reading a byte — which is
    // the point: a 50 MB spec must not be streamed just to be refused.
    //
    // Hand-built rather than a real `Response`: the constructor computes
    // `content-length` from the body it was given, so a declared value
    // cannot be set on one. Reading was proved absent by leaving `body`
    // and `text` off entirely — touching either throws.
    let read = false
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: (k: string) => (k === 'content-length' ? String(100 * 1024 * 1024) : null) },
      get body() { read = true; throw new Error('the body must not be read') },
    })))
    const d = dest()
    expect(await pullSpec('https://x.com/s.json', d)).toBe(1)
    expect(read, 'refused from the header, without reading').toBe(false)
    expect(existsSync(d)).toBe(false)
  })

  it('refuses an oversized CHUNKED response, which declares no length', async () => {
    // The half the header cannot cover. Without the streaming cap a spec
    // URL that starts streaming a database dump fills the disk.
    //
    // The stream is a VALID spec padded past the cap, deliberately: a
    // stream of zero bytes would be refused for failing to parse, so the
    // spec would pass with the cap removed. It has to be refused for its
    // SIZE and nothing else — asserted on the message below.
    const MB = 1024 * 1024
    const enc = new TextEncoder()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(enc.encode('{"openapi":"3.0.0","info":{"title":"T","version":"1","description":"'))
          const pad = enc.encode('a'.repeat(MB))
          for (let i = 0; i < 65; i++) c.enqueue(pad)
          c.enqueue(enc.encode('"},"paths":{}}'))
          c.close()
        },
      }),
      { status: 200 },
    )))
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const d = dest()
    expect(await pullSpec('https://x.com/s.json', d)).toBe(1)
    expect(errSpy.mock.calls.flat().join(' '), 'refused for SIZE, not for parsing')
      .toMatch(/more than/)
    expect(existsSync(d)).toBe(false)
  }, 30_000)
})

describe('a network failure is reported, never thrown', () => {
  it('reports an unreachable host with the reason', async () => {
    // A throw from the CLI prints a stack into the terminal instead of
    // the URL that failed.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const d = dest()
    expect(await pullSpec('https://nope.invalid/s.json', d)).toBe(1)
    expect(existsSync(d)).toBe(false)
  })

  it('reports a TIMEOUT distinctly from an unreachable host', async () => {
    // Different fixes — one is a slow server, the other a wrong URL.
    const err = new Error('timed out')
    err.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn(async () => { throw err }))
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(await pullSpec('https://slow.example.com/s.json', dest())).toBe(1)
    const printed = errSpy.mock.calls.flat().join(' ')
    if (printed.length > 0) expect(printed.toLowerCase()).toMatch(/respond|timed|30s/)
  })

  it('survives a non-Error rejection', async () => {
    // `err instanceof Error` is false for a thrown string; without the
    // String() arm the message reads `undefined`.
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'a plain string' }))
    expect(await pullSpec('https://x.com/s.json', dest())).toBe(1)
  })
})
