// pyreon-lint-disable-file pyreon/prefer-isserver -- the online and offline listeners live on window, are attached on the first add() and removed by dispose(); tests give a bare window
// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the online and offline listeners live on window, are attached on the first add() and removed by dispose(); tests give a bare window
import { computed, getCurrentScope } from '@pyreon/reactivity'
import { sumProgress } from './progress'
import { admit, cancelItems, countAccepted, createQ, disposeQ, goOffline, goOnline, makeItem, pauseItems, publish, removeItem, resumeItems, retryItems, startItems } from './queue'
import type { FileRejection, FileRule, Progress, Transport, UploadError } from './types'

export type FileStatus = 'queued' | 'validating' | 'rejected' | 'uploading' | 'paused' | 'done' | 'failed' | 'cancelled'

/** One item of a queue: plain data, and functions that read the parts that change (they are signals, so reading one in an effect or JSX tracks it). */
export interface UploadFile {
  readonly id: string
  readonly file: File | Blob
  readonly name: string
  readonly size: number
  readonly type: string
  readonly meta: Readonly<Record<string, unknown>>
  status(): FileStatus
  /** Bytes sent. It never goes back: a retry restarts on the wire but the number holds until the new attempt passes it. */
  progress(): Progress
  /** Bytes per second, smoothed; `null` until it can be measured. */
  speed(): number | null
  /** Milliseconds left; `null` when the speed is unknown. */
  remaining(): number | null
  error(): UploadError | null
  /** What the transport resolved with. */
  result(): unknown
  /** An object URL for an image or video, when `preview` is on. Revoked when the file is removed or the uploader is disposed. */
  preview(): string | null
  /** Tries made so far for the current upload (0 before the first). */
  attempt(): number
  /** Why the file was rejected, when it was. */
  rejections(): readonly FileRejection[]
}

export interface UploaderOptions {
  transport: Transport
  rules?: FileRule
  /** Files uploading at once. A whole number from 1. Default 3. */
  concurrency?: number
  /** Start uploading as files are added. Default true. */
  autoStart?: boolean
  /** Tries in total (the first included) and the delay before each retry. Default 3 tries, 500 ms doubling with jitter. `false` never retries. */
  retry?: { attempts?: number; backoff?: (attempt: number) => number } | false
  /** Pause uploads while the browser is offline and resume them when it is back. Default true. */
  pauseWhenOffline?: boolean
  meta?: (file: File) => Record<string, unknown>
  /** Object URLs for images and videos (up to `maxSize`, default 50 MB). */
  preview?: boolean | { maxSize?: number }
  /** Keep rejected files in the list with their reasons. Default true. */
  keepRejected?: boolean
  /** Reject a file that has the same name, size and modification time as one already in the list. Default false. */
  dedupe?: boolean
  onDone?(file: UploadFile, result: unknown): void
  onError?(file: UploadFile, error: UploadError): void
  onReject?(file: UploadFile, rejections: readonly FileRejection[]): void
  onAllDone?(files: readonly UploadFile[]): void
  /** Called when a transport saves resume state, so an app can persist it (for example with `@pyreon/storage`). */
  onResumeState?(file: UploadFile, state: unknown): void
  /** Clock in ms, for tests. */
  now?: () => number
}

export interface Uploader {
  files(): readonly UploadFile[]
  add(files: FileList | readonly (File | Blob)[] | DataTransfer): UploadFile[]
  remove(id: string): void
  clear(): void
  start(id?: string): void
  pause(id?: string): void
  resume(id?: string): void
  cancel(id?: string): void
  retry(id?: string): void
  progress(): Progress
  status(): 'idle' | 'uploading' | 'paused' | 'done' | 'failed'
  isUploading(): boolean
  dispose(): void
}


const isFileList = (x: unknown): x is FileList => typeof FileList !== 'undefined' && x instanceof FileList
const isDataTransfer = (x: unknown): x is DataTransfer => typeof DataTransfer !== 'undefined' && x instanceof DataTransfer

function listOf(input: FileList | readonly (File | Blob)[] | DataTransfer): (File | Blob)[] {
  if (isDataTransfer(input)) return Array.from(input.files)
  if (isFileList(input)) return Array.from(input)
  if (Array.isArray(input)) return [...input]
  if (typeof input === 'object' && input !== null && typeof (input as { length?: unknown }).length === 'number') return Array.from(input as ArrayLike<File>)
  throw new TypeError(`[Pyreon] uploader.add: expected a FileList, an array of File or a DataTransfer, got ${String(input)}.`)
}

/**
 * A reactive upload queue: files are validated, then sent by a transport with a concurrency limit, retries for failures that can
 * be retried, pause, resume, cancel and aggregate progress, all as signals. Progress is written to signals once per animation
 * frame, however often the transport reports. Created inside a component (or any effect scope) it is disposed with it; otherwise
 * call `dispose()`. Creating one touches no browser API, so it is safe on the server.
 *
 * @example typeof createUploader({ transport: { upload: async () => 'ok' } }).add // => 'function'
 */
export function createUploader(options: UploaderOptions): Uploader {
  if (typeof options !== 'object' || options === null || typeof options.transport?.upload !== 'function') {
    throw new TypeError('[Pyreon] createUploader: expected options with a transport, such as { transport: xhrTransport({ url: "/upload" }) }.')
  }
  const q = createQ(options)
  const onOffline = (): void => goOffline(q)
  const onOnline = (): void => goOnline(q)

  function listen(): void {
    if (q.listening || options.pauseWhenOffline === false || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
    q.listening = true
    q.offline = typeof navigator !== 'undefined' && navigator.onLine === false
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
  }

  function add(input: FileList | readonly (File | Blob)[] | DataTransfer): UploadFile[] {
    if (q.disposed) return []
    const files = listOf(input)
    const added: UploadFile[] = []
    let existing = countAccepted(q)

    listen()
    for (const file of files) {
      const it = makeItem(q, file)

      q.items.set(it.view.id, it)
      added.push(it.view)
      admit(q, it, existing)
      if (it.status !== 'rejected') existing++
    }
    publish(q)

    return added
  }

  const dispose = (): void => disposeQ(q, { offline: onOffline, online: onOnline })
  const progress = computed(() => sumProgress(q.list().map((f) => f.progress())))
  const status = computed((): 'idle' | 'uploading' | 'paused' | 'done' | 'failed' => {
    const states = q.list().map((f) => f.status())

    if (states.some((s) => s === 'uploading' || s === 'validating' || s === 'queued')) return 'uploading'
    if (states.some((s) => s === 'paused')) return 'paused'
    if (states.some((s) => s === 'failed')) return 'failed'

    return states.some((s) => s === 'done') ? 'done' : 'idle'
  })

  getCurrentScope()?.add(dispose)

  return {
    files: () => q.list(),
    add,
    remove: (id) => removeItem(q, id),
    clear: () => [...q.items.keys()].forEach((id) => removeItem(q, id)),
    start: (id) => startItems(q, id),
    pause: (id) => pauseItems(q, id),
    resume: (id) => resumeItems(q, id),
    cancel: (id) => cancelItems(q, id),
    retry: (id) => retryItems(q, id),
    progress: () => progress(),
    status: () => status(),
    isUploading: () => status() === 'uploading',
    dispose,
  }
}

/**
 * `createUploader` for a component: the same queue, disposed when the component unmounts (the effect scope it was created in
 * ends). Call it in a component's setup.
 *
 * @example typeof useUploader({ transport: { upload: async () => 'ok' } }).files // => 'function'
 */
export function useUploader(options: UploaderOptions): Uploader {
  return createUploader(options)
}
