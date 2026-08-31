/**
 * Native-runtime invariants that are real but not observable from a test.
 *
 * Both of these are properties of WHICH THREAD or WHICH HANDLER runs code —
 * the stub harness has neither a looper to drain nor a second uncaught-exception
 * handler to be displaced by, so a behavioural assertion would pass either way.
 * They are asserted statically, the same way the revalidate handler's
 * constant-time comparison is: when a property is invisible to behaviour, the
 * source is the only place it can be pinned.
 *
 * Comments are stripped before matching — each fix's own comment quotes the old
 * expression to explain why it was wrong, and a naive scan reads that as the
 * defect still being present.
 *
 * Bisect-verified: reverting either fix fails its spec.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// `import.meta.url` is not a file: URL under every runner, so resolve through
// the module path rather than URL-joining it.
const NATIVE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'native')

/** Source with `//` and `*`-continuation comment lines removed. */
function code(rel: string): string {
  return readFileSync(resolve(NATIVE, rel), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

describe('the debounce scheduler runs the user body on the main thread', () => {
  // `TimerTask.run` executes on the Timer's own thread, so a debounced body —
  // which writes signals — was an off-main Compose state write:
  // `IllegalArgumentException: Detected multithreaded access to
  // SnapshotStateObserver`. That is the exact crash PyreonWebSocketOkHttp and
  // PyreonNetworkStatusAndroid each document and each already fix by posting to
  // the main looper; the scheduler the emitter ships into EVERY debounced
  // callback did not. Reachable with no unusual host code.
  const kt = code('kotlin/com/pyreon/runtime/PyreonRateLimit.kt')

  it('Kotlin posts the callback to the main looper', () => {
    expect(kt).toContain('Looper.getMainLooper()')
    expect(kt).toMatch(/main\.post\s*\{\s*work\(\)\s*\}/)
  })

  it('Kotlin shares ONE daemon timer rather than a thread per callback', () => {
    // It was `java.util.Timer(true)` per instance, one instance per debounced
    // callback, never cancelled — a thread leak per screen.
    expect(kt).toContain('SHARED_TIMER')
    expect(kt).not.toMatch(/private val timer = java\.util\.Timer/)
  })

  it('Kotlin guards the task map it mutates from two threads', () => {
    expect(kt).toContain('synchronized(lock)')
  })

  const sw = code('swift/PyreonRateLimit.swift')

  it('Swift hops to the MainActor — an unstructured Task does not inherit it', () => {
    expect(sw).toContain('await MainActor.run { work() }')
  })

  it('Swift guards the task dictionary', () => {
    // Concurrent Swift Dictionary mutation is undefined behaviour, not merely a
    // lost entry; the practical symptom is a `cancel` that goes missing.
    expect(sw).toContain('NSLock()')
  })
})

describe('the Swift crash reporter chains to the handler it displaces', () => {
  // `NSSetUncaughtExceptionHandler` REPLACES the current handler. Installing
  // without capturing the previous one silently disconnects whatever crash SDK
  // the app configured first — the vendor dashboard goes quiet and nothing says
  // why. The Kotlin twin has always chained, and its header states the rule:
  // "a crash reporter that swallows the crash changes app behavior".
  const sw = code('swift/PyreonCrashReporter.swift')

  it('captures the previous handler', () => {
    expect(sw).toContain('NSGetUncaughtExceptionHandler()')
  })

  it('forwards to it from inside the installed handler', () => {
    expect(sw).toContain('PyreonCrashReporter.previousHandler?(exception)')
  })

  it('persists BEFORE forwarding — the previous handler may terminate', () => {
    const body = sw.slice(sw.indexOf('NSSetUncaughtExceptionHandler'))
    expect(body.indexOf('persist(')).toBeLessThan(body.indexOf('previousHandler?('))
  })

  it('the Kotlin twin still chains — the behaviour being mirrored', () => {
    expect(code('kotlin/com/pyreon/runtime/PyreonCrashReporter.kt')).toContain(
      'previous?.uncaughtException(thread, error)',
    )
  })
})
