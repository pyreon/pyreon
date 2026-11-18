// pyreon-lint-disable-file pyreon/prefer-isserver -- the listeners are removed only where window exists
/** The engine behind `createUploader`: state in one object, behaviour in small functions that take it. */
import { batch, signal, type Signal } from '@pyreon/reactivity'
import { defaultBackoff, toUploadError, uploadError } from './errors'
import { createSpeedMeter, monotonic, progressOf, remainingMs, type SpeedMeter } from './progress'
import { validateFile } from './validate'
import type { FileStatus, UploadFile, UploaderOptions } from './uploader'
import type { FileRejection, Progress, UploadError } from './types'

export interface Item {
  view: UploadFile
  file: File | Blob
  sig: {
    status: Signal<FileStatus>
    progress: Signal<Progress>
    speed: Signal<number | null>
    remaining: Signal<number | null>
    error: Signal<UploadError | null>
    result: Signal<unknown>
    preview: Signal<string | null>
    attempt: Signal<number>
    rejections: Signal<readonly FileRejection[]>
  }
  status: FileStatus
  size: number
  /** The most bytes reported so far: what progress shows, never lower. */
  high: number
  dirty: boolean
  controller: AbortController | null
  /** Bumped whenever an attempt is stopped, so a late answer from it is recognised and ignored. */
  token: number
  attempts: number
  notBefore: number
  seq: number
  armed: boolean
  paused: 'user' | 'offline' | null
  resumeState: unknown
  meter: SpeedMeter
  previewUrl: string | null
  key: string
}

export interface Q {
  o: UploaderOptions
  concurrency: number
  policy: { attempts: number; backoff: (attempt: number) => number } | null
  autoStart: boolean
  keepRejected: boolean
  clock: () => number
  list: Signal<readonly UploadFile[]>
  items: Map<string, Item>
  prefix: string
  counter: number
  seq: number
  disposed: boolean
  quiet: boolean
  frame: (() => void) | null
  wake: ReturnType<typeof setTimeout> | null
  listening: boolean
  offline: boolean
}

const FRAME_FALLBACK_MS = 100

export function wholeAtLeastOne(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`[Pyreon] createUploader: ${name} must be a whole number from 1, got ${String(value)}. Use 1 to upload one file at a time.`)

  return value
}

/** Run `fn` on the next animation frame, or after 100 ms when frames are not running (a hidden tab) or do not exist. Returns the canceller. */
function nextFrame(fn: () => void): () => void {
  let done = false
  let raf: number | undefined
  const cancel = (): void => {
    done = true
    if (raf !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
    clearTimeout(timer)
  }
  const fire = (): void => {
    if (done) return
    cancel()
    fn()
  }
  const timer = setTimeout(fire, FRAME_FALLBACK_MS)

  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(fire)

  return cancel
}

export function createQ(o: UploaderOptions): Q {
  return {
    o,
    concurrency: wholeAtLeastOne('concurrency', o.concurrency ?? 3),
    policy: o.retry === false ? null : { attempts: o.retry?.attempts ?? 3, backoff: o.retry?.backoff ?? ((n: number) => defaultBackoff(n)) },
    autoStart: o.autoStart !== false,
    keepRejected: o.keepRejected !== false,
    clock: o.now ?? (() => Date.now()),
    list: signal<readonly UploadFile[]>([]),
    items: new Map(),
    prefix: `u${Math.random().toString(36).slice(2, 6)}-`,
    counter: 0,
    seq: 0,
    disposed: false,
    quiet: true,
    frame: null,
    wake: null,
    listening: false,
    offline: false,
  }
}

const all = (q: Q): Item[] => [...q.items.values()]

export const select = (q: Q, id?: string): Item[] => {
  if (id === undefined) return all(q)
  const it = q.items.get(id)

  return it === undefined ? [] : [it]
}

export function setStatus(it: Item, s: FileStatus): void {
  it.status = s
  it.sig.status.set(s)
}

export function writeProgress(it: Item, complete = false): void {
  const p = progressOf(it.high, it.size, complete)
  const speed = it.meter.speed()

  batch(() => {
    it.sig.progress.set(p)
    it.sig.remaining.set(remainingMs(p.loaded, p.total, speed))
    it.sig.speed.set(speed)
  })
}

export function revoke(it: Item): void {
  if (it.previewUrl !== null && typeof URL !== 'undefined') URL.revokeObjectURL(it.previewUrl)
  it.previewUrl = null
  it.sig.preview.set(null)
}

export function stopRun(it: Item, why: string): void {
  it.token++
  const controller = it.controller

  it.controller = null
  if (controller !== null && !controller.signal.aborted) controller.abort(uploadError('aborted', `The upload was stopped (${why}).`))
}

function call(fn: () => void): void {
  try {
    fn()
  } catch (error) {
    // A throwing callback must not stop the queue.
    // oxlint-disable-next-line no-console
    console.error('[Pyreon] upload: a callback threw', error)
  }
}

function flush(q: Q): void {
  q.frame = null
  batch(() => {
    for (const it of q.items.values()) {
      if (!it.dirty) continue
      it.dirty = false
      writeProgress(it)
    }
  })
}

function report(q: Q, it: Item, token: number, loaded: number): void {
  if (token !== it.token || q.disposed || typeof loaded !== 'number' || Number.isNaN(loaded)) return
  const next = monotonic(it.high, Math.min(Math.max(0, loaded), it.size))

  if (next === it.high) return
  it.high = next
  it.meter.record(next, q.clock())
  it.dirty = true
  if (q.frame === null) q.frame = nextFrame(() => flush(q))
}

const TERMINAL: readonly FileStatus[] = ['done', 'failed', 'rejected', 'cancelled']

export function settled(q: Q): void {
  if (q.quiet || !all(q).every((it) => TERMINAL.includes(it.status))) return
  q.quiet = true
  call(() => q.o.onAllDone?.([...q.list()]))
}

export function pump(q: Q): void {
  if (q.disposed || q.offline) return
  if (q.wake !== null) {
    clearTimeout(q.wake)
    q.wake = null
  }
  const now = q.clock()
  let running = all(q).filter((it) => it.status === 'uploading').length
  const waiting = all(q).filter((it) => it.status === 'queued' && it.armed).sort((a, b) => a.seq - b.seq)
  let next = Infinity

  for (const it of waiting) {
    if (it.notBefore > now) next = Math.min(next, it.notBefore)
    else if (running < q.concurrency) {
      run(q, it)
      running++
    }
  }
  if (next !== Infinity) q.wake = setTimeout(() => pump(q), Math.max(0, next - now))
}

function finish(q: Q, it: Item, outcome: { result: unknown } | { error: UploadError }): void {
  it.controller = null
  batch(() => {
    if ('result' in outcome) {
      it.high = it.size
      writeProgress(it, true)
      it.sig.result.set(outcome.result)
      it.sig.error.set(null)
    } else it.sig.error.set(outcome.error)
    setStatus(it, 'result' in outcome ? 'done' : 'failed')
  })
  if ('result' in outcome) call(() => q.o.onDone?.(it.view, outcome.result))
  else call(() => q.o.onError?.(it.view, outcome.error))
  settled(q)
  pump(q)
}

function failed(q: Q, it: Item, error: UploadError): void {
  const policy = q.policy

  if (policy === null || !error.retryable || it.attempts >= policy.attempts) return finish(q, it, { error })
  it.controller = null
  it.notBefore = q.clock() + Math.max(policy.backoff(it.attempts), error.retryAfter ?? 0)
  it.seq = ++q.seq
  batch(() => {
    it.sig.error.set(error)
    setStatus(it, 'queued')
  })
  pump(q)
}

function run(q: Q, it: Item): void {
  const controller = new AbortController()
  const token = ++it.token

  it.controller = controller
  it.attempts++
  batch(() => {
    it.sig.attempt.set(it.attempts)
    setStatus(it, 'uploading')
  })
  const ctx = {
    signal: controller.signal,
    onProgress: (loaded: number) => report(q, it, token, loaded),
    resumeState: it.resumeState,
    saveResumeState: (state: unknown) => {
      if (token !== it.token) return
      it.resumeState = state
      call(() => q.o.onResumeState?.(it.view, state))
    },
  }
  let promise: Promise<unknown>

  try {
    promise = Promise.resolve(q.o.transport.upload(it.view, ctx))
  } catch (error) {
    promise = Promise.reject(error)
  }
  promise.then(
    (result) => {
      if (token === it.token && !q.disposed) finish(q, it, { result })
    },
    (error: unknown) => {
      if (token === it.token && !q.disposed) failed(q, it, toUploadError(error))
    },
  )
}

// ── offline ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function goOffline(q: Q): void {
  q.offline = true
  batch(() => {
    for (const it of all(q)) {
      if (it.status !== 'uploading') continue
      stopRun(it, 'offline')
      it.paused = 'offline'
      setStatus(it, 'paused')
    }
  })
}

export function goOnline(q: Q): void {
  q.offline = false
  for (const it of all(q)) {
    if (it.paused !== 'offline') continue
    it.paused = null
    it.notBefore = 0
    setStatus(it, 'queued')
  }
  pump(q)
}

// ── adding ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function publish(q: Q): void {
  q.list.set([...q.items.values()].map((i) => i.view))
}

export function makeItem(q: Q, file: File | Blob): Item {
  const id = `${q.prefix}${++q.counter}`
  const sig: Item['sig'] = {
    status: signal<FileStatus>('queued'),
    progress: signal<Progress>(progressOf(0, file.size)),
    speed: signal<number | null>(null),
    remaining: signal<number | null>(null),
    error: signal<UploadError | null>(null),
    result: signal<unknown>(undefined),
    preview: signal<string | null>(null),
    attempt: signal(0),
    rejections: signal<readonly FileRejection[]>([]),
  }
  const name = (file as File).name ?? ''
  const meta = Object.freeze({ ...(q.o.meta === undefined ? {} : q.o.meta(file as File)) })
  const view: UploadFile = { id, file, name, size: file.size, type: file.type, meta, ...sig }

  return {
    view, file, sig, size: file.size, status: 'queued', high: 0, dirty: false, controller: null, token: 0, attempts: 0, notBefore: 0, seq: ++q.seq, armed: q.autoStart,
    paused: null, resumeState: undefined, meter: createSpeedMeter(), previewUrl: null, key: `${name}|${file.size}|${(file as File).lastModified ?? ''}`,
  }
}

function makePreview(q: Q, it: Item): void {
  const pv = q.o.preview

  if (pv === undefined || pv === false || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const max = typeof pv === 'object' ? (pv.maxSize ?? 50e6) : 50e6

  if (!/^(image|video)\//.test(it.file.type) || it.size > max) return
  it.previewUrl = URL.createObjectURL(it.file)
  it.sig.preview.set(it.previewUrl)
}

function reject(q: Q, it: Item, rejections: readonly FileRejection[]): void {
  batch(() => {
    it.sig.rejections.set(rejections)
    it.sig.error.set(uploadError('rejected', rejections[0]?.message ?? 'The file was not accepted.', { retryable: false }))
    setStatus(it, 'rejected')
  })
  call(() => q.o.onReject?.(it.view, rejections))
  if (!q.keepRejected && q.items.delete(it.view.id)) publish(q)
}

function accept(q: Q, it: Item): void {
  if (q.disposed || q.items.get(it.view.id) !== it) return
  makePreview(q, it)
  setStatus(it, 'queued')
  q.quiet = false
  pump(q)
}

/** Check one new item (duplicate, count, then its rules) and either reject it or queue it. */
export function admit(q: Q, it: Item, existing: number): void {
  const rules = q.o.rules ?? {}
  const duplicate = q.o.dedupe === true && all(q).some((o) => o !== it && o.status !== 'rejected' && o.key === it.key)

  if (duplicate) return reject(q, it, [{ code: 'duplicate', message: 'This file was already added.', params: { name: it.view.name } }])
  if (rules.maxFiles !== undefined && existing >= rules.maxFiles) {
    return reject(q, it, [{ code: 'too-many', message: `At most ${rules.maxFiles} ${rules.maxFiles === 1 ? 'file is' : 'files are'} allowed.`, params: { max: rules.maxFiles } }])
  }
  const verdict = validateFile(it.file, rules)

  if (!(verdict instanceof Promise)) return verdict.length > 0 ? reject(q, it, verdict) : accept(q, it)
  setStatus(it, 'validating')
  verdict.then(
    (found) => {
      if (q.items.get(it.view.id) !== it) return
      if (found.length > 0) reject(q, it, found)
      else accept(q, it)
    },
    (error: unknown) => reject(q, it, [{ code: 'custom', message: error instanceof Error ? error.message : 'The file could not be checked.', params: {} }]),
  )
}

export function countAccepted(q: Q): number {
  return all(q).filter((i) => i.status !== 'rejected' && i.status !== 'cancelled').length
}

// ── controls ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function removeItem(q: Q, id: string): void {
  const it = q.items.get(id)

  if (it === undefined) return
  stopRun(it, 'remove')
  revoke(it)
  q.items.delete(id)
  publish(q)
  pump(q)
  settled(q)
}

export function startItems(q: Q, id?: string): void {
  q.quiet = false
  for (const it of select(q, id)) if (it.status === 'queued') it.armed = true
  pump(q)
}

export function pauseItems(q: Q, id?: string): void {
  batch(() => {
    for (const it of select(q, id)) {
      if (it.status !== 'uploading' && it.status !== 'queued') continue
      stopRun(it, 'pause')
      it.paused = 'user'
      setStatus(it, 'paused')
    }
  })
  pump(q)
}

export function resumeItems(q: Q, id?: string): void {
  for (const it of select(q, id)) {
    if (it.status !== 'paused') continue
    it.paused = null
    it.armed = true
    it.notBefore = 0
    setStatus(it, 'queued')
  }
  q.quiet = false
  pump(q)
}

const ACTIVE: readonly FileStatus[] = ['uploading', 'queued', 'paused', 'validating']

export function cancelItems(q: Q, id?: string): void {
  batch(() => {
    for (const it of select(q, id)) {
      if (!ACTIVE.includes(it.status)) continue
      stopRun(it, 'cancel')
      it.paused = null
      setStatus(it, 'cancelled')
    }
  })
  pump(q)
  settled(q)
}

export function retryItems(q: Q, id?: string): void {
  for (const it of select(q, id)) {
    if (it.status !== 'failed' && it.status !== 'cancelled') continue
    if (it.status === 'cancelled') {
      it.high = 0
      it.meter.reset()
      it.resumeState = undefined
      writeProgress(it)
    }
    it.attempts = 0
    it.armed = true
    it.notBefore = 0
    it.seq = ++q.seq
    setStatus(it, 'queued')
  }
  q.quiet = false
  pump(q)
}

export function disposeQ(q: Q, listeners: { offline(): void; online(): void }): void {
  if (q.disposed) return
  q.disposed = true
  for (const it of all(q)) {
    stopRun(it, 'dispose')
    revoke(it)
    if (ACTIVE.includes(it.status)) setStatus(it, 'cancelled')
  }
  if (q.wake !== null) clearTimeout(q.wake)
  q.wake = null
  if (q.frame !== null) q.frame()
  q.frame = null
  if (q.listening && typeof window !== 'undefined') {
    window.removeEventListener('offline', listeners.offline)
    window.removeEventListener('online', listeners.online)
  }
  q.listening = false
}
