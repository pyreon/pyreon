/**
 * The shape of `results/<runId>/<arm>.json`. `results/README.md` documents
 * every field; change both together and raise `RESULT_SCHEMA` in `lib/run.ts`
 * when a field changes meaning.
 */
import type { Inventory, LoadSample } from './browser'
import type { StackManifest } from './stacks'

/** One server start: cold start, then warm-up (discarded), single-connection latency, throughput. */
export interface ServerStart {
  /** Spawn of the server process to the first HTTP 200 on `/items`, ms. */
  coldStartMs: number
  /** Requests per second, autocannon's average over the timed window. */
  rps: number
  /** Latency percentiles under load, ms. */
  p50: number
  p99: number
  /** Connection errors plus timeouts under load. */
  errors: number
  non2xx: number
  /** Response bytes per request under load (shows whether the server compressed). */
  bytesPerReq: number
  /** Per request on one keep-alive connection, ms: request written to headers parsed. */
  ttfb: number[]
  /** Per request on the same connection, ms: request written to last body byte. */
  ttlb: number[]
  /** What the server answers when a client asks for gzip or brotli (untimed probe). */
  contentEncoding: string | null
  transferEncoding: string | null
}

export interface ArmResult {
  schema: 1
  runId: string
  id: string
  label: string
  /** Installed version of every package the arm's `stack.json` lists. */
  versions: Record<string, string>
  node: string
  chromium: string
  hydration: StackManifest['hydration']
  streaming: string
  notes: string[]
  docs: string[]
  gateNotes: string[]
  /** `os.loadavg()` (1, 5 and 15 minutes) before and after the arm. */
  load: { before: number[]; after: number[] }
  startedAt: string
  wallMs: number
  /** One entry per server start. */
  server: ServerStart[]
  /** One array of timed page loads per browser server start. */
  browser: LoadSample[][]
  inventory: Inventory
}
