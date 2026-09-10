/**
 * The LSP stdio transport's frame parser.
 *
 * `startLspServer` reads Content-Length-framed JSON-RPC off stdin. Every
 * test for this module drives `_handleMessage` directly, so the framing
 * loop — the part that decides where one message ends and the next begins
 * — had no coverage at all. That is the wrong half to leave untested: a
 * dispatch bug shows up as one broken feature, a framing bug desynchronises
 * the stream and every subsequent message is garbage.
 *
 * The cases below are the ones that actually happen against a real editor:
 * a large document arrives split across chunks, a fast typist's edits
 * arrive coalesced into one chunk, and anything malformed must leave the
 * buffer in a state where the NEXT frame still parses. A parser that
 * wedges is indistinguishable from a crashed server from the editor's
 * side — diagnostics simply stop, with no error anywhere.
 */
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetOpenDocuments, startLspServer } from '../lsp'

/** Stand-in for `process.stdin`: an emitter that accepts `setEncoding`. */
class FakeStdin extends EventEmitter {
  setEncoding(): this {
    return this
  }
  feed(chunk: string): void {
    this.emit('data', chunk)
  }
}

const frame = (obj: unknown): string => {
  const body = JSON.stringify(obj)
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}

/** Parse everything the server wrote back into message objects. */
const parseOut = (chunks: string[]): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = []
  for (const c of chunks.join('').split(/Content-Length:\s*\d+\r\n\r\n/).slice(1)) {
    if (c.trim()) out.push(JSON.parse(c) as Record<string, unknown>)
  }
  return out
}

let stdin: FakeStdin
let written: string[]
let realStdin: NodeJS.ReadStream

beforeEach(() => {
  _resetOpenDocuments()
  written = []
  stdin = new FakeStdin()
  realStdin = process.stdin
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true })
  vi.spyOn(process.stdout, 'write').mockImplementation((c: string | Uint8Array) => {
    written.push(String(c))
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  startLspServer()
})

afterEach(() => {
  Object.defineProperty(process, 'stdin', { value: realStdin, configurable: true })
  vi.restoreAllMocks()
  _resetOpenDocuments()
})

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }

describe('frames arriving one per chunk', () => {
  it('answers a complete frame with a Content-Length-framed reply', () => {
    // The control: without it every "survives X" spec below passes against
    // a server that never answers anything.
    stdin.feed(frame(INIT))
    expect(written.join(''), 'the reply must be framed too').toMatch(/Content-Length: \d+\r\n\r\n/)
    const msgs = parseOut(written)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.id).toBe(1)
    expect(msgs[0]!.result).toBeDefined()
  })

  it('the reply\'s Content-Length is the BYTE length of its body', () => {
    // Byte length, not character count — a reply whose header undercounts
    // leaves the editor waiting for bytes that never come, and the session
    // hangs rather than errors.
    stdin.feed(frame({ jsonrpc: '2.0', id: 7, method: 'initialize', params: {} }))
    const raw = written.join('')
    const declared = Number(raw.match(/Content-Length: (\d+)/)![1])
    const body = raw.slice(raw.indexOf('\r\n\r\n') + 4)
    expect(Buffer.byteLength(body)).toBe(declared)
  })
})

describe('chunk boundaries do not align with frame boundaries', () => {
  it('a frame SPLIT across two chunks is handled once complete', () => {
    // The single most common real failure: a large document does not
    // arrive in one read. A parser that assumes it does drops the message
    // silently and the editor shows no diagnostics, forever.
    const f = frame(INIT)
    const cut = Math.floor(f.length / 2)
    stdin.feed(f.slice(0, cut))
    expect(parseOut(written), 'nothing may be answered from a partial frame').toHaveLength(0)
    stdin.feed(f.slice(cut))
    expect(parseOut(written)).toHaveLength(1)
  })

  it('a frame split INSIDE the header is handled too', () => {
    // The header itself can straddle a chunk — the loop must not treat a
    // missing `\r\n\r\n` as a malformed frame and discard the buffer.
    const f = frame(INIT)
    stdin.feed(f.slice(0, 8))
    stdin.feed(f.slice(8))
    expect(parseOut(written)).toHaveLength(1)
  })

  it('TWO frames in ONE chunk are both handled', () => {
    // Coalesced writes are ordinary under fast typing. A loop that
    // processes only the first frame per chunk drops every edit but one.
    stdin.feed(frame(INIT) + frame({ jsonrpc: '2.0', id: 2, method: 'shutdown', params: {} }))
    const msgs = parseOut(written)
    expect(msgs.map((m) => m.id)).toEqual([1, 2])
  })

  it('a frame arriving one byte at a time still parses', () => {
    // The degenerate split. Slow, but it proves the buffer accumulates
    // rather than being reset per chunk.
    for (const ch of frame(INIT)) stdin.feed(ch)
    expect(parseOut(written)).toHaveLength(1)
  })
})

describe('malformed input must not wedge the stream', () => {
  it('a header with NO Content-Length is skipped and the next frame still parses', () => {
    // If the parser left this in the buffer it would re-scan the same bad
    // header forever and every later message would be ignored.
    stdin.feed('X-Nonsense: 1\r\n\r\n' + frame(INIT))
    expect(parseOut(written), 'the good frame after it must be answered').toHaveLength(1)
  })

  it('a body that is not JSON is dropped, and the next frame still parses', () => {
    // The catch around JSON.parse. Without it one bad frame throws out of
    // the data handler and takes the server down mid-session.
    const bad = 'not json at all'
    stdin.feed(`Content-Length: ${Buffer.byteLength(bad)}\r\n\r\n${bad}`)
    expect(parseOut(written)).toHaveLength(0)
    stdin.feed(frame(INIT))
    expect(parseOut(written), 'the server must still be alive').toHaveLength(1)
  })

  it('a notification (no id) produces no reply but is still consumed', () => {
    // `didClose` returns null. The frame must still be removed from the
    // buffer, or the next frame is read from the wrong offset.
    stdin.feed(
      frame({
        jsonrpc: '2.0',
        method: 'textDocument/didClose',
        params: { textDocument: { uri: 'file:///a.tsx' } },
      }) + frame(INIT),
    )
    const msgs = parseOut(written)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.id, 'the frame AFTER the notification must be the one answered').toBe(1)
  })
})

describe('documents flow through the transport end to end', () => {
  it('didOpen publishes diagnostics for a file with a subset warning', () => {
    // The whole point of the server, exercised through the real framing
    // path rather than by calling the handler directly.
    stdin.feed(
      frame({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: {
          textDocument: {
            uri: 'file:///Warns.tsx',
            text: 'function f<T>(xs: T[]): T { return xs[0] }\nexport function C() { return <text>hi</text> }',
          },
        },
      }),
    )
    const msgs = parseOut(written)
    const publish = msgs.find((m) => m.method === 'textDocument/publishDiagnostics')
    expect(publish, 'a diagnostics notification must be sent').toBeDefined()
    const params = publish!.params as { uri: string; diagnostics: unknown[] }
    expect(params.uri).toBe('file:///Warns.tsx')
    expect(params.diagnostics.length).toBeGreaterThanOrEqual(1)
  })

  it('a NON-ASCII document round-trips through the frame parser', () => {
    // Content-Length is a BYTE count while a decoded chunk is a JS string
    // measured in UTF-16 code units, so any multi-byte character makes the
    // two disagree. If the loop compares them directly it slices the body
    // short, JSON.parse fails, and the document is silently dropped —
    // meaning diagnostics break for any file containing an accent or an
    // emoji, which is not an edge case in real source.
    const text = 'export function C() { return <text>héllo 🎉 wörld</text> }'
    stdin.feed(
      frame({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///Unicode.tsx', text } },
      }),
    )
    const publish = parseOut(written).find((m) => m.method === 'textDocument/publishDiagnostics')
    expect(publish, 'a multi-byte document must not be dropped').toBeDefined()
    expect((publish!.params as { uri: string }).uri).toBe('file:///Unicode.tsx')
  })
})
