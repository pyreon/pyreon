/**
 * The shape of `results/<runId>/<arm>.json`. `results/README.md` documents
 * every field; change both together and raise `RESULT_SCHEMA` in `run.ts`
 * when a field changes meaning.
 */

export interface Sizes {
  raw: number
  gzip: number
  brotli: number
}

export interface FirstLoadRequest {
  /** Path on the arm's origin. */
  path: string
  kind: 'html' | 'js' | 'css' | 'other'
  /** Bytes of the file as built, and compressed by the harness (gzip -9, brotli 11). */
  raw: number
  gzip: number
  brotli: number
}

export interface Bundle {
  /** Every same-origin request of an unthrottled first load of `/products` until the list is shown and the network is idle. */
  firstLoad: FirstLoadRequest[]
  firstLoadTotals: { js: Sizes; css: Sizes; html: Sizes }
  /** Every .js and .css file in the build output, loaded or not. */
  build: { js: Sizes & { files: number }; css: Sizes & { files: number } }
}

/** One throttled first load of `/products`. Times are ms from navigation start (`performance.timeOrigin`). */
export interface TtiSample {
  /** The probe's input made `#count` show the filtered count: time to interactive. */
  ttiMs: number
  /** `#count` first showed the unfiltered count: the list is on screen (in the DOM). */
  firstRenderMs: number
  /** The probe's first input event. */
  firstAttemptMs: number
  /** Input events the probe needed; more than 1 means the first one was not handled. */
  attempts: number
  /** `first-contentful-paint`, or -1 when the browser reported none. */
  fcpMs: number
  domContentLoadedMs: number
  loadEventEndMs: number
  /** `[startTime, duration]` of every long task (≥ 50 ms) the page reported before the run ended. */
  longTasks: Array<[number, number]>
  /** Sum of `transferSize` over the navigation and resource timing entries: bytes over the (throttled) wire. */
  transferBytes: number
}

export interface Heap {
  /** `Runtime.getHeapUsage` after garbage collection settled: the page's JS heap. */
  usedBytes: number
  totalBytes: number
  /** `Memory.getDOMCounters`. */
  nodes: number
  listeners: number
  documents: number
  /** Forced collections before the heap settled (`GC_STABLE_BYTES` between two in a row, or `GC_MAX_ROUNDS`). */
  gcRounds: number
}

/** One unthrottled page for the memory measure. */
export interface MemorySample {
  /** `/__blank` (no script) on the same server, measured the same way: the floor of a page. */
  blank: Heap
  /** `/products` loaded, the list shown, the network idle. */
  afterLoad: Heap
  /** After one scripted session (`harness/session.ts`). */
  afterSession: Heap
  /** After `knobs.sessions` sessions in the same page. */
  afterSessions: Heap
  /** Per session, per step: ms from the step's first action to its expected DOM (no paint). */
  sessionSteps: number[][]
}

export interface ArmResult {
  schema: 1
  runId: string
  id: string
  label: string
  router: string
  state: string
  codeSplitting: string
  notes: string[]
  docs: string[]
  /** Installed version of every package the arm's `arm.json` lists. */
  versions: Record<string, string>
  bundle: Bundle
  tti: TtiSample[]
  memory: MemorySample[]
}
