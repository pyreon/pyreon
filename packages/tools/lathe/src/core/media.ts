/**
 * How a response body is DECODED, from the media type the spec declares.
 *
 * The vocabulary is `@pyreon/http`'s `ResponseKind`, which the generated
 * adapters mirror. Anything that is not JSON used to be parsed as JSON anyway,
 * so a `text/plain` log, a CSV export or a PDF threw
 * `response body could not be read as JSON` on every call (audit B4).
 */
import type { IrOperation } from './ir'

export type ResponseKind = 'json' | 'text' | 'blob' | 'stream'

const NDJSON = new Set([
  'application/x-ndjson',
  'application/ndjson',
  'application/jsonl',
  'application/jsonlines',
  'application/x-jsonlines',
  'application/stream+json',
])

/**
 * The stream format a media type carries, or `undefined` for a non-stream.
 *
 * Checked BEFORE the JSON test anywhere a media type is classified:
 * `application/stream+json` ends in `+json`, and read as JSON a whole stream
 * is parsed as one document — which fails on the second line.
 */
export function streamFormatOf(mediaType: string): 'sse' | 'ndjson' | undefined {
  const media = mediaType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (media === 'text/event-stream') return 'sse'
  return NDJSON.has(media) ? 'ndjson' : undefined
}

/** The decode for one operation's success response. */
export function responseKindOf(op: IrOperation): ResponseKind {
  const media = op.responseMedia?.split(';')[0]?.trim().toLowerCase()
  if (media === undefined) return 'json'
  if (streamFormatOf(media) !== undefined) return 'stream'
  if (media.startsWith('text/')) return 'text'
  // XML, form data and the like are text a caller parses; everything else
  // (octet-stream, images, PDFs, archives, audio, video) is binary.
  if (media.endsWith('/xml') || media.endsWith('+xml') || media === 'application/x-www-form-urlencoded') {
    return 'text'
  }
  return 'blob'
}

/** The TypeScript type a decoded body of this kind has. */
export function responseKindTs(kind: Exclude<ResponseKind, 'json'>): string {
  return kind === 'text' ? 'string' : kind === 'blob' ? 'Blob' : 'ReadableStream<Uint8Array> | null'
}
