import { render } from './render'
import type { DocNode, RenderOptions } from './types'
import { isServer } from '@pyreon/reactivity'

const FORMAT_MAP: Record<string, string> = {
  html: 'html',
  htm: 'html',
  pdf: 'pdf',
  docx: 'docx',
  doc: 'docx',
  xlsx: 'xlsx',
  xls: 'xlsx',
  pptx: 'pptx',
  ppt: 'pptx',
  md: 'md',
  txt: 'text',
  csv: 'csv',
  svg: 'svg',
  json: 'json',
  jsonl: 'jsonl',
  ndjson: 'jsonl',
}

/** Grace period before the object URL is revoked (FileSaver.js uses 40s). */
const REVOKE_DELAY_MS = 10_000

const MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  email: 'text/html',
  md: 'text/markdown',
  text: 'text/plain',
  csv: 'text/csv',
  svg: 'image/svg+xml',
  json: 'application/json',
  jsonl: 'application/x-ndjson',
}

/**
 * Download a document in the browser.
 *
 * @example
 * ```tsx
 * await download(doc, 'report.pdf')
 * await download(doc, 'report.docx')
 * ```
 */
export async function download(
  node: DocNode,
  filename: string,
  options?: RenderOptions,
): Promise<void> {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext) {
    throw new Error('[@pyreon/document] Filename must have an extension (e.g., report.pdf).')
  }

  const format = FORMAT_MAP[ext]
  if (!format) {
    throw new Error(
      `[@pyreon/document] Unknown file extension '.${ext}'. Supported: ${Object.keys(FORMAT_MAP).join(', ')}`,
    )
  }

  if (isServer) {
    throw new Error('[@pyreon/document] download() requires a browser environment.')
  }

  const result = await render(node, format, options)

  // Every FORMAT_MAP value has a MIME_TYPES entry — including the binary
  // formats, whose Blob previously carried NO type (an empty `blob.type`).
  /* v8 ignore next — format is always a known FORMAT_MAP value present in MIME_TYPES */
  const type = MIME_TYPES[format] ?? 'application/octet-stream'
  const blob = new Blob([result instanceof Uint8Array ? (result as BlobPart) : result], { type })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoke on a later task, not synchronously after click(): the download
  // is started asynchronously, and older Safari/Firefox builds resolve the
  // object URL after the click handler returns — revoking in the same task
  // could cancel the download there.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
