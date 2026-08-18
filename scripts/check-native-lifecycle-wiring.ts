#!/usr/bin/env bun
/**
 * Gate: every native LIFECYCLE container — one exposing a reactive
 * `start()`/`connect()` that feeds a signal — must either be AUTO-STARTED by
 * BOTH emitters, or be explicitly registered as MANUAL with a rationale.
 *
 * ── The bug class this closes ─────────────────────────────────────────────
 * A native container ships a real `start()` behind which a live monitor writes
 * a signal (NWPathMonitor, UIApplication lifecycle notifications, the crash
 * hook, the push receipt pipeline). The emit auto-starts these by DECL KIND —
 * one hand-written `.onAppear { x.start() }` loop per kind. If a container's
 * `start()` is NOT wired, NOTHING calls it, and the hook renders its INITIAL
 * state forever: `useOnline()` frozen at `true`, `usePush()` / `useAppState()`
 * frozen at their seed. All THREE shipped this way and were found together
 * (2026-08-04) — the "never-wired class". The masking is total: a simulator is
 * always online, so `Online: true` is indistinguishable from a working hook.
 *
 * A per-kind allowlist in the emit is fragile: the NEXT reactive container
 * added is a silent no-op until someone remembers to wire it. This gate makes
 * an UNCLASSIFIED lifecycle container a red — so a new one cannot ship frozen.
 *
 * Policy:
 *   AUTO   → wired in emit-swift.ts AND emit-kotlin.ts (verified here).
 *   MANUAL → deliberately not auto-started (user action / needs a transport
 *            arg); a rationale is required.
 * A start()/connect() container in NEITHER list fails the gate.
 *
 * Pure logic (discover / classify / verify) is unit-tested in
 * `packages/internals/test-utils/src/tests/check-native-lifecycle-wiring.test.ts`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface LifecycleEntry {
  /** the native class name, identical on Swift + Kotlin */
  container: string
  /** the lifecycle verb it exposes */
  method: 'start' | 'connect'
  policy: 'auto' | 'manual'
  /** AUTO only: the ComponentIR decl.kind the emit wires it under */
  declKind?: string
  /** MANUAL only: why it is deliberately not auto-started */
  why?: string
}

/**
 * The classification registry. Adding a native container that exposes
 * `start()`/`connect()` REQUIRES an entry here — that is the whole point.
 */
export const LIFECYCLE_REGISTRY: LifecycleEntry[] = [
  // ── AUTO: a reactive monitor whose start()/stop() drives a signal. MUST be
  // wired in both emits, or the hook ships frozen at its initial value.
  { container: 'PyreonNetworkStatus', method: 'start', policy: 'auto', declKind: 'network-status' },
  { container: 'PyreonAppState', method: 'start', policy: 'auto', declKind: 'app-state' },
  { container: 'PyreonPushNotifications', method: 'start', policy: 'auto', declKind: 'push' },
  { container: 'PyreonCrashReporter', method: 'start', policy: 'auto', declKind: 'crash-reporter' },
  { container: 'PyreonWebSocket', method: 'connect', policy: 'auto', declKind: 'websocket' },

  // ── MANUAL: start()/connect() is a deliberate user action or needs a
  // transport/host argument — auto-starting on appear would be wrong.
  {
    container: 'PyreonGeolocation',
    method: 'start',
    policy: 'manual',
    why: 'permission-gated; explicit start() keeps the sensor off until the user opts in (the 0-arg start() errors on a real device without a host closure)',
  },
  {
    container: 'PyreonPayments',
    method: 'connect',
    policy: 'manual',
    why: 'a purchase flow is user-triggered; auto-connecting a store on appear is never correct',
  },
  {
    container: 'PyreonAudioPlayer',
    method: 'start',
    policy: 'manual',
    why: 'playback begins on a user action, not on appear',
  },
  {
    container: 'PyreonVideoPlayer',
    method: 'start',
    policy: 'manual',
    why: 'playback begins on a user action, not on appear',
  },
  {
    container: 'PyreonAudioRecorder',
    method: 'start',
    policy: 'manual',
    why: 'recording begins on a user action; auto-starting the microphone on appear would be wrong (and a privacy foot-gun)',
  },
  {
    container: 'PyreonDeviceMotion',
    method: 'start',
    policy: 'manual',
    why: 'a battery-draining motion sensor; explicit opt-in keeps it off until the app asks for it',
  },
]

const LIFECYCLE_RE = /\b(?:func|fun)\s+(start|connect)\s*\(/

/** A native source file the gate reads. */
export interface NativeFile {
  path: string
  text: string
}

/**
 * Discover every native container that exposes a `start(`/`connect(` lifecycle
 * method. Keyed by container class name (Swift + Kotlin share the name), with
 * the verb captured. Deliberately does NOT match `begin(` — that verb is the
 * recorder/sensor idiom (AudioRecorder, DeviceMotion) and is user-triggered by
 * construction, outside the auto-start class.
 */
export function discoverLifecycleContainers(
  files: NativeFile[],
): Map<string, { method: 'start' | 'connect'; files: string[] }> {
  const found = new Map<string, { method: 'start' | 'connect'; files: string[] }>()
  for (const f of files) {
    const m = f.text.match(LIFECYCLE_RE)
    if (!m) continue
    // container name = the file's basename without extension (PyreonX.swift → PyreonX)
    const base = f.path.replace(/^.*\//, '').replace(/\.(swift|kt)$/, '')
    // strip an Android/OkHttp companion suffix so the base class dedupes
    const container = base.replace(/(Android|OkHttp)$/, '')
    const method = m[1] as 'start' | 'connect'
    const prev = found.get(container)
    if (prev) prev.files.push(f.path)
    else found.set(container, { method, files: [f.path] })
  }
  return found
}

export interface WiringProblem {
  kind: 'unclassified' | 'auto-not-wired' | 'manual-no-rationale' | 'registry-stale'
  container: string
  detail: string
}

/**
 * The pure verifier. Given the discovered containers, the registry, and the two
 * emit source texts, return every problem. Empty array = pass.
 */
export function verifyLifecycleWiring(
  discovered: Map<string, { method: 'start' | 'connect'; files: string[] }>,
  registry: LifecycleEntry[],
  emits: { swift: string; kotlin: string },
): WiringProblem[] {
  const problems: WiringProblem[] = []
  const byContainer = new Map(registry.map((e) => [e.container, e]))

  // (1) COMPLETENESS — every discovered lifecycle container must be classified.
  for (const [container, info] of discovered) {
    if (!byContainer.has(container)) {
      problems.push({
        kind: 'unclassified',
        container,
        detail: `exposes ${info.method}() (${info.files[0]}) but is not in LIFECYCLE_REGISTRY. Classify it: AUTO (a reactive monitor — add a declKind + wire .onAppear{start()} in BOTH emit-swift.ts and emit-kotlin.ts) or MANUAL (user-triggered — add a rationale). An unclassified reactive container ships FROZEN at its initial value (the useOnline/usePush/useAppState class).`,
      })
    }
  }

  // (2) The registry must not rot — every AUTO/MANUAL entry must still exist.
  for (const e of registry) {
    if (!discovered.has(e.container)) {
      problems.push({
        kind: 'registry-stale',
        container: e.container,
        detail: `is in LIFECYCLE_REGISTRY but no native file exposes its ${e.method}(). Remove the stale entry or restore the container.`,
      })
    }
  }

  // (3) AUTO entries must be wired in BOTH emits; MANUAL entries need a reason.
  for (const e of registry) {
    if (e.policy === 'auto') {
      const kind = e.declKind ?? ''
      const lit = `'${kind}'`
      if (!emits.swift.includes(lit)) {
        problems.push({
          kind: 'auto-not-wired',
          container: e.container,
          detail: `is AUTO but emit-swift.ts does not reference its decl kind ${lit} — its .onAppear{ ${e.method}() } wiring is missing, so ${e.container} ships frozen on iOS.`,
        })
      }
      if (!emits.kotlin.includes(lit)) {
        problems.push({
          kind: 'auto-not-wired',
          container: e.container,
          detail: `is AUTO but emit-kotlin.ts does not reference its decl kind ${lit} — its lifecycle wiring is missing, so ${e.container} ships frozen on Android.`,
        })
      }
    } else if (!e.why || e.why.trim().length === 0) {
      problems.push({
        kind: 'manual-no-rationale',
        container: e.container,
        detail: `is MANUAL but has no rationale. Add \`why\` explaining why it is not auto-started on appear.`,
      })
    }
  }

  return problems
}

// ── thin main: wire the pure logic to the real repo ────────────────────────
function readNativeFiles(root: string): NativeFile[] {
  const dirs = [
    'packages/fundamentals/hooks/native/swift',
    'packages/fundamentals/hooks/native/kotlin/com/pyreon/runtime',
  ]
  const files: NativeFile[] = []
  for (const d of dirs) {
    const abs = join(root, d)
    if (!existsSync(abs)) continue
    for (const name of readdirSync(abs)) {
      if (!/\.(swift|kt)$/.test(name)) continue
      files.push({ path: join(d, name), text: readFileSync(join(abs, name), 'utf8') })
    }
  }
  return files
}

function main(): number {
  const root = process.cwd()
  const files = readNativeFiles(root)
  if (files.length === 0) {
    console.error('[check-native-lifecycle-wiring] no native source found — run from the repo root.')
    return 1
  }
  const discovered = discoverLifecycleContainers(files)
  const emits = {
    swift: readFileSync(join(root, 'packages/native/compiler/src/emit-swift.ts'), 'utf8'),
    kotlin: readFileSync(join(root, 'packages/native/compiler/src/emit-kotlin.ts'), 'utf8'),
  }
  const problems = verifyLifecycleWiring(discovered, LIFECYCLE_REGISTRY, emits)

  if (problems.length === 0) {
    const auto = LIFECYCLE_REGISTRY.filter((e) => e.policy === 'auto').length
    const manual = LIFECYCLE_REGISTRY.length - auto
    console.log(
      `✓ Native lifecycle wiring OK — ${discovered.size} lifecycle container(s): ${auto} auto-started (wired both emits), ${manual} manual (documented).`,
    )
    return 0
  }
  console.error(`✗ Native lifecycle wiring — ${problems.length} problem(s):`)
  for (const p of problems) {
    console.error(`  [${p.kind}] ${p.container} ${p.detail}`)
  }
  return 1
}

if (import.meta.main) process.exit(main())
