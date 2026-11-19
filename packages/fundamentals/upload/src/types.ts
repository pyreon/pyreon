/** Why an upload (or a file) did not work. `retryable` says whether trying again can help. */
export interface UploadError {
  kind: 'rejected' | 'network' | 'server' | 'aborted' | 'timeout'
  message: string
  /** The HTTP status, for `server` errors. */
  status?: number
  retryable: boolean
  /** Milliseconds the server asked to wait (`Retry-After`), when it did. */
  retryAfter?: number
  /** The parsed response body of a failed request, when there was one. */
  body?: unknown
  cause?: unknown
}

export type RejectionCode = 'too-large' | 'too-small' | 'type' | 'too-many' | 'dimensions' | 'custom' | 'duplicate' | 'directory'

/** A reason a file was not accepted. `params` carries the numbers and names a translated message needs. */
export interface FileRejection {
  code: RejectionCode
  message: string
  params: Readonly<Record<string, unknown>>
}

/** What a file is checked against. Sizes accept bytes or text such as `'10 MB'`. */
export interface FileRule {
  maxSize?: number | string
  minSize?: number | string
  /** MIME patterns and extensions, as in the `accept` attribute: `image/*`, `application/pdf`, `.csv`. */
  accept?: readonly string[]
  /** Most files in a queue (counted by `validateFiles` and the uploader). */
  maxFiles?: number
  /** Image checks; they decode the image, so validation becomes asynchronous. */
  image?: { maxWidth?: number; maxHeight?: number; minWidth?: number; minHeight?: number; aspect?: number | { min?: number; max?: number } }
  /** Read the first bytes and reject a file whose real type is not in `accept` (a renamed .exe). Asynchronous. */
  sniff?: boolean
  /** Your own check: a message to reject, or `null` to accept. May be asynchronous. */
  custom?: (file: File | Blob) => string | null | Promise<string | null>
}

/** A moment of a transfer, in bytes. `ratio` is 0 to 1. */
export interface Progress {
  loaded: number
  total: number
  ratio: number
}

/** What a transport receives for one attempt. */
export interface TransportContext {
  signal: AbortSignal
  /** Bytes of the file confirmed sent so far. May be called often: the queue coalesces. */
  onProgress(loaded: number): void
  /** The state a previous attempt saved with `saveResumeState`, when there is one. */
  resumeState?: unknown
  saveResumeState(state: unknown): void
}

/** The part of an `UploadFile` a transport may read. */
export interface TransportFile {
  readonly id: string
  readonly file: File | Blob
  readonly name: string
  readonly size: number
  readonly type: string
  readonly meta: Readonly<Record<string, unknown>>
}

/** Sends one file. Resolve with what the server returned; reject with an `UploadError` (see `uploadError`). */
export interface Transport {
  upload(file: TransportFile, ctx: TransportContext): Promise<unknown>
}
