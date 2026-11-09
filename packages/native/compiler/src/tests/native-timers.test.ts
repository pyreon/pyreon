// `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` lower to the runtimes' `PyreonTimers`.
//
// Before, each was emitted verbatim — `setTimeout(...)` in Swift / Kotlin, where no such function exists — and the
// native build failed with no warning from the compiler. A delayed write in a handler (a toast that clears itself, a
// "saved" flash) and an interval started in `onMount` are among the commonest app shapes (128 uses across the repo's
// examples). The compile half pins the emit on both toolchains; the behaviour half EXECUTES both runtimes against
// one scripted scenario and compares them to the web's answer.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })

const handlers = `import { signal } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const msg = signal('')
  const ticks = signal(0)
  const timer = signal<number | undefined>(undefined)
  const flash = () => {
    msg.set('saved')
    setTimeout(() => msg.set(''), 2000)
  }
  const tick = () => ticks.set(ticks() + 1)
  const start = () => { timer.set(setInterval(tick, 1000)) }
  const stop = () => { clearInterval(timer()); timer.set(undefined) }
  const later = () => { const id = setTimeout(() => { msg.set('late'); ticks.set(0) }, 50); if (ticks() > 3) clearTimeout(id) }
  onMount(() => {
    timer.set(setInterval(() => ticks.set(ticks() + 1), 500))
    return () => clearInterval(timer())
  })
  return (<Stack><Text>{msg()}</Text><Text>{ticks()}</Text><Button onPress={flash}>f</Button><Button onPress={start}>s</Button>
    <Button onPress={stop}>x</Button><Button onPress={later}>l</Button></Stack>)
}`

describe('timer calls lower to PyreonTimers', () => {
  it('Swift: a closure, a named handler wrapped in a closure, the id as an Int, clear on an optional id', () => {
    const { code, warnings } = emit(handlers, 'swift')
    expect(code).toContain('PyreonTimers.setTimeout(2000, { msg = "" })')
    expect(code).toContain('timer = PyreonTimers.setInterval(1000, { tick() })')
    expect(code).toContain('PyreonTimers.clear(timer)')
    expect(code).toMatch(/let id = PyreonTimers\.setTimeout\(50, \{/)
    expect(code).toContain('PyreonTimers.clear(id)')
    expect(code).not.toMatch(/(?<![.\w])(setTimeout|setInterval|clearTimeout|clearInterval)\(/)
    expect(warnings).toEqual([])
  })

  it('Kotlin: the same calls, the callback as a trailing lambda', () => {
    const { code, warnings } = emit(handlers, 'kotlin')
    expect(code).toContain('PyreonTimers.setTimeout(2000L) { msg = "" }')
    expect(code).toContain('timer = PyreonTimers.setInterval(1000L) { tick() }')
    expect(code).toContain('PyreonTimers.clear(timer)')
    expect(code).toContain('PyreonTimers.clear(id)')
    expect(code).not.toMatch(/(?<![.\w])(setTimeout|setInterval|clearTimeout|clearInterval)\(/)
    expect(warnings).toEqual([])
  })

  it('extra callback arguments are named, not silently dropped', () => {
    const src = handlers.replace("setTimeout(() => msg.set(''), 2000)", "setTimeout((m: string) => msg.set(m), 2000, '')")
    for (const target of ['swift', 'kotlin'] as const) {
      expect(emit(src, target).warnings.join('\n')).toContain('the extra arguments')
    }
  })

  it.runIf(isSwiftcAvailable())('swiftc type-checks it (stubs)', () => {
    const r = validateSwiftWithStubs(emit(handlers, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isSwiftUIAvailable())('swiftc type-checks it (real SDK)', () => {
    const r = validateSwiftTypecheck(emit(handlers, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isKotlincAvailable())('kotlinc compiles it', () => {
    const r = validateKotlin(emit(handlers, 'kotlin').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)
})

// ── Behaviour: both runtimes run one scenario and print the web's sequence ──────────────────────────────────────
//
// t=0: A = timeout 500ms, B = timeout 500ms (same delay: FIFO, A first), C = timeout 20ms cleared immediately,
//      I = interval 10ms that clears itself on its 3rd tick, Z = timeout with a NEGATIVE delay (runs as 0).
// Expected (the browser's order): Z, I1, I2, I3, A, B — and nothing left scheduled. Ids are positive and distinct, and
// clearing an unknown id (999) or nil is a no-op.
//
// The delays are wall-clock, so they carry wide margins: the interval's three ticks (~30ms) finish ~470ms before A,
// and the scenario waits 1.5s before reading `pending`. Tighter values (80ms / 0.2s) flaked on loaded macOS CI
// runners, where interval ticks slipped past A and B had not fired when the window closed.
const EXPECTED = ['ids ok', 'Z', 'I1', 'I2', 'I3', 'A', 'B', 'pending 0'].join('\n')

function webSequence(): Promise<string> {
  return new Promise((resolve) => {
    const out: string[] = []
    const a = setTimeout(() => out.push('A'), 500)
    const b = setTimeout(() => out.push('B'), 500)
    const c = setTimeout(() => out.push('C'), 20)
    clearTimeout(c)
    let n = 0
    const i = setInterval(() => {
      n += 1
      out.push(`I${n}`)
      if (n === 3) clearInterval(i)
    }, 10)
    const z = setTimeout(() => out.push('Z'), -5)
    clearTimeout(999 as unknown as ReturnType<typeof setTimeout>)
    clearTimeout(undefined)
    const ids = [a, b, c, i, z].map(Number)
    out.unshift(new Set(ids).size === 5 && ids.every((x) => x > 0) ? 'ids ok' : 'ids bad')
    setTimeout(() => {
      out.push('pending 0')
      resolve(out.join('\n'))
    }, 1500)
  })
}

const runtime = (lang: 'swift' | 'kotlin') =>
  readFileSync(
    lang === 'swift'
      ? join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonTimers.swift')
      : join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonTimers.kt'),
    'utf8',
  )

const SWIFT_SCENARIO = `
var out: [String] = []
let a = PyreonTimers.setTimeout(500) { out.append("A") }
let b = PyreonTimers.setTimeout(500) { out.append("B") }
let c = PyreonTimers.setTimeout(20) { out.append("C") }
PyreonTimers.clear(c)
var n = 0
var i = 0
i = PyreonTimers.setInterval(10) {
  n += 1
  out.append("I\\(n)")
  if n == 3 { PyreonTimers.clear(i) }
}
let z = PyreonTimers.setTimeout(-5) { out.append("Z") }
PyreonTimers.clear(999)
PyreonTimers.clear(nil)
let ids = [a, b, c, i, z]
out.insert(Set(ids).count == 5 && ids.allSatisfy { $0 > 0 } ? "ids ok" : "ids bad", at: 0)
RunLoop.main.run(until: Date().addingTimeInterval(1.5))
out.append("pending \\(PyreonTimers.pendingCount)")
print(out.joined(separator: "\\n"))
`

// A plain JVM has no main looper: the scenario installs a single-threaded executor as the scheduler (the seam the
// runtime exposes for exactly this), and two stand-in android.os classes satisfy the default scheduler's references.
const ANDROID_STANDINS = `package android.os
class Looper { companion object { fun getMainLooper(): Looper = Looper() } }
class Handler(@Suppress("UNUSED_PARAMETER") l: Looper) {
  fun postDelayed(r: Runnable, d: Long): Boolean = error("not on a JVM")
  fun removeCallbacks(r: Runnable) {}
}
`

const KOTLIN_SCENARIO = `import com.pyreon.runtime.PyreonTimers
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

fun main() {
  val exec = Executors.newSingleThreadScheduledExecutor()
  val futures = HashMap<Runnable, ScheduledFuture<*>>()
  PyreonTimers.scheduler = object : PyreonTimers.Scheduler {
    override fun post(delayMs: Long, task: Runnable) { futures[task] = exec.schedule(task, delayMs, TimeUnit.MILLISECONDS) }
    override fun cancel(task: Runnable) { futures.remove(task)?.cancel(false) }
  }
  val out = mutableListOf<String>()
  exec.submit {
    val a = PyreonTimers.setTimeout(500) { out.add("A") }
    val b = PyreonTimers.setTimeout(500) { out.add("B") }
    val c = PyreonTimers.setTimeout(20) { out.add("C") }
    PyreonTimers.clear(c)
    var n = 0
    var i = 0L
    i = PyreonTimers.setInterval(10) {
      n += 1
      out.add("I$n")
      if (n == 3) PyreonTimers.clear(i)
    }
    val z = PyreonTimers.setTimeout(-5) { out.add("Z") }
    PyreonTimers.clear(999L)
    PyreonTimers.clear(null)
    val ids = listOf(a, b, c, i, z)
    out.add(0, if (ids.toSet().size == 5 && ids.all { it > 0 }) "ids ok" else "ids bad")
  }.get()
  Thread.sleep(1500)
  exec.submit { out.add("pending \${PyreonTimers.pendingCount}") }.get()
  exec.shutdownNow()
  println(out.joinToString("\\n"))
}
`

describe('PyreonTimers keeps the web contract', () => {
  it('the web itself produces the expected sequence', async () => {
    expect(await webSequence()).toBe(EXPECTED)
  })

  it.runIf(isSwiftcAvailable())('Swift runtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-timers-'))
    writeFileSync(join(dir, 'main.swift'), `${runtime('swift')}\n${SWIFT_SCENARIO}`)
    execFileSync('swiftc', [join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
    expect(execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trim()).toBe(EXPECTED)
  }, 180_000)

  it.runIf(isKotlincAvailable())('Kotlin runtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-timers-'))
    writeFileSync(join(dir, 'PyreonTimers.kt'), runtime('kotlin'))
    writeFileSync(join(dir, 'Android.kt'), ANDROID_STANDINS)
    writeFileSync(join(dir, 'main.kt'), KOTLIN_SCENARIO)
    execFileSync(
      'kotlinc',
      [join(dir, 'PyreonTimers.kt'), join(dir, 'Android.kt'), join(dir, 'main.kt'), '-include-runtime', '-d', join(dir, 'p.jar')],
      { stdio: 'pipe' },
    )
    expect(execFileSync('java', ['-jar', join(dir, 'p.jar')], { encoding: 'utf8' }).trim()).toBe(EXPECTED)
  }, 240_000)
})
