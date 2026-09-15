// A warm, in-process Kotlin compiler for the validation harness.
//
// `validateKotlin` used to spawn `kotlinc` per check: a cold JVM, the whole
// 2,300-line Compose stub file re-analysed every time, and codegen to a
// throwaway directory. Measured on a real emit, one check cost 4.2s here and
// ~6s on a two-core CI runner — and the suite makes ~600 of them, which is
// why sixteen native shards spend ~140 runner-minutes per CI run while the
// same specs warm-cached run in seconds. The compile-verdict cache cannot
// absorb it: any edit to the stubs (ten in the last fortnight) legitimately
// invalidates every Kotlin verdict, so a stub-touching PR pays the full
// cold cost, and so does every other PR until a warm store accumulates.
//
// The same check against a loaded `K2JVMCompiler`, with the stubs compiled
// once into a jar on the classpath, measures ~78ms — the JVM start and the
// stub analysis were the cost, not the input. So this module keeps ONE
// compiler JVM per test process and feeds it through a spool directory:
//
//   - The caller is synchronous (`validateKotlin` returns a verdict), so the
//     transport cannot be an async stdio stream. The caller writes
//     `<seq>.req`, the daemon answers `<seq>.res`, and the caller sleeps in
//     1ms `Atomics.wait` slices until it appears. Both sides write to a
//     `.tmp` and rename, so a half-written file is never read.
//   - The daemon exits when its stdin closes (the parent died) and is also
//     killed on `process.exit`; a request that exceeds the compile timeout
//     kills it too, and the check falls back to plain `kotlinc`.
//   - The server source is embedded below and compiled once per kotlinc
//     version into the verdict cache directory (~2s); the stubs jar likewise
//     once per stubs text (~4s). Both ride the CI cache restore.
//
// Every failure — no `java`, no compiler jar next to `kotlinc`, a JVM that
// never reports ready, a daemon exception — degrades to the per-check
// `kotlinc` path the harness has always had. The daemon is a speed-up, never
// a second source of verdicts: the parity spec compiles the same shapes both
// ways and asserts identical outcomes. `PYREON_KOTLIN_DAEMON=0` forces the
// plain path (bisects, or a toolchain that misbehaves in-process).

import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { cacheDir } from './validate-cache'

/** Field separator inside a request line; U+0001 cannot appear in a path. */
const FS = '\u0001'
/** File-list separator inside the third field. */
const LS = '\u0002'

/**
 * The compile server, in Kotlin. Loops over the spool directory: the oldest
 * `<seq>.req` (zero-padded, so lexical order is arrival order) is compiled
 * with `K2JVMCompiler.exec`, and `<seq>.res` carries the exit code on its
 * first line followed by the compiler's own diagnostics — byte-for-byte what
 * `kotlinc` would have printed to stderr, so a rejection reads the same.
 * A stdin-reading watchdog thread ends the JVM when the parent goes away.
 */
export const KOTLIN_DAEMON_SERVER_KT = `
import org.jetbrains.kotlin.cli.jvm.K2JVMCompiler
import java.io.ByteArrayOutputStream
import java.io.PrintStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardCopyOption

fun main(args: Array<String>) {
  val spool: Path = Paths.get(args[0])
  val compiler = K2JVMCompiler()
  val stdin = System.\`in\`
  val watchdog = Thread {
    try { while (stdin.read() != -1) { } } catch (_: Throwable) { }
    System.exit(0)
  }
  watchdog.isDaemon = true
  watchdog.start()
  Files.write(spool.resolve("pid"), ProcessHandle.current().pid().toString().toByteArray(Charsets.UTF_8))
  Files.write(spool.resolve("ready"), ByteArray(0))
  while (true) {
    val req = Files.list(spool).use { s ->
      s.filter { it.fileName.toString().endsWith(".req") }.sorted().findFirst().orElse(null)
    }
    if (req == null) { Thread.sleep(2); continue }
    val parts = String(Files.readAllBytes(req), Charsets.UTF_8).split('\\u0001')
    val files = parts[2].split('\\u0002').filter { it.isNotEmpty() }
    val buf = ByteArrayOutputStream()
    val ps = PrintStream(buf, true, "UTF-8")
    val code = try {
      compiler.exec(ps, "-nowarn", "-no-stdlib", "-no-reflect", "-d", parts[0], "-cp", parts[1], *files.toTypedArray()).code
    } catch (t: Throwable) {
      ps.println("kotlin daemon: compiler threw " + t)
      ps.flush()
      3
    }
    val name = req.fileName.toString().removeSuffix(".req")
    val tmp = spool.resolve(name + ".res.tmp")
    Files.write(tmp, (code.toString() + "\\n").toByteArray(Charsets.UTF_8) + buf.toByteArray())
    Files.move(tmp, spool.resolve(name + ".res"), StandardCopyOption.ATOMIC_MOVE)
    Files.deleteIfExists(req)
  }
}
`

export interface DaemonVerdict {
  /** The compiler's exit code: 0 accepted, 1 rejected, anything else environmental. */
  code: number
  /** The compiler's diagnostics, as `kotlinc` would have printed them. */
  output: string
}

interface Daemon {
  /** The JVM when this process spawned it; null when attached to a shared one. */
  child: ChildProcess | null
  /** The JVM's pid (from its `pid` file) — liveness for the attached case. */
  pid: number
  spool: string
  seq: number
  libDir: string
  stderr: string[]
  /** Whether this process owns the JVM (and must clean up its spool). */
  owned: boolean
}

/** Env var through which a run-wide daemon (vitest globalSetup) hands its spool to worker processes. */
export const SHARED_SPOOL_ENV = 'PYREON_KOTLIN_DAEMON_SPOOL'

function alive(d: Daemon): boolean {
  if (d.child) return d.child.exitCode === null && d.child.signalCode === null
  try {
    process.kill(d.pid, 0)
    return true
  } catch {
    return false
  }
}

interface Slot {
  daemon: Daemon | null
  /** Set once the daemon is known unusable in this process; the reason is printed once. */
  disabled: string | null
  announced: boolean
}

// Survives vitest's per-file module isolation: the module is re-evaluated per
// test file, the process is not, and a JVM per test file would be the cost
// this exists to remove.
const SLOT = Symbol.for('pyreon:kotlin-daemon')
function slot(): Slot {
  const g = globalThis as unknown as Record<symbol, Slot | undefined>
  return (g[SLOT] ??= { daemon: null, disabled: null, announced: false })
}

/** True while this process has a live daemon. */
export function _kotlinDaemonActive(): boolean {
  const d = slot().daemon
  return d !== null && alive(d)
}

/** Why the daemon is not in use in this process, or null while it is. */
export function kotlinDaemonDisabledReason(): string | null {
  return slot().disabled
}

/** For testing: forget the daemon state (kills a live one). */
export function _resetKotlinDaemon(): void {
  const s = slot()
  if (s.daemon) stopDaemon(s.daemon)
  s.daemon = null
  s.disabled = null
  s.announced = false
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function sha(...parts: string[]): string {
  const h = createHash('sha256')
  for (const p of parts) h.update(p).update('\0')
  return h.digest('hex').slice(0, 24)
}

/**
 * The kotlinc install's `lib/` — where `kotlin-compiler.jar` and
 * `kotlin-stdlib.jar` live. `KOTLIN_HOME` first, else derived from the
 * resolved `kotlinc` script (`<home>/bin/kotlinc`; Homebrew's wrapper
 * resolves through `libexec/bin`, which the realpath follows).
 */
export function kotlinLibDir(): string | null {
  const candidates: string[] = []
  const home = process.env.KOTLIN_HOME
  if (home) candidates.push(join(home, 'lib'))
  try {
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['kotlinc'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')[0]
    if (found) {
      const script = realpathSync(found)
      const bin = dirname(script)
      // `<home>/bin/kotlinc` (the distribution zip, the ubuntu runner image's
      // /usr/share/kotlinc) and Homebrew's `<cellar>/bin/kotlinc` shim whose
      // real home is `<cellar>/libexec`.
      candidates.push(resolve(bin, '..', 'lib'), resolve(bin, '..', 'libexec', 'lib'))
      // A wrapper script that execs the real one names it: follow that too.
      try {
        for (const m of readFileSync(script, 'utf8').matchAll(/(\/[^\s"']+)\/bin\/kotlinc/g)) {
          candidates.push(join(m[1]!, 'lib'))
        }
      } catch {
        // Unreadable wrapper; the layout candidates above still apply.
      }
    }
  } catch {
    // Not on PATH; only KOTLIN_HOME can answer.
  }
  for (const c of candidates) {
    if (existsSync(join(c, 'kotlin-compiler.jar')) && existsSync(join(c, 'kotlin-stdlib.jar')))
      return c
  }
  return null
}

function runnable(java: string): boolean {
  try {
    execFileSync(java, ['-version'], { stdio: 'ignore', timeout: 60_000 })
    return true
  } catch {
    return false
  }
}

/**
 * A runnable `java`: the explicit `JAVACMD` / `JAVA_HOME` first, then the JVM
 * `kotlinc` ITSELF runs on. The last is the one that always exists when
 * kotlinc works at all (macOS ships a `/usr/bin/java` stub that fails, and a
 * Homebrew kotlinc points at its own JDK through its wrapper), and kotlinc
 * will name it: `-J` passes a flag to its JVM, and `-XshowSettings:properties`
 * prints `java.home`. That probe starts a JVM, so the answer is cached on
 * disk per kotlinc binary.
 */
function javaCommand(): string | null {
  if (process.env.JAVACMD && runnable(process.env.JAVACMD)) return process.env.JAVACMD
  if (process.env.JAVA_HOME) {
    const j = join(process.env.JAVA_HOME, 'bin', 'java')
    if (runnable(j)) return j
  }
  const cache = cacheDir()
  let kotlincPath = 'kotlinc'
  try {
    kotlincPath = realpathSync(
      execFileSync(process.platform === 'win32' ? 'where' : 'which', ['kotlinc'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .split('\n')[0]!,
    )
  } catch {
    // Keep the bare name; the probe below still answers if it runs.
  }
  const memo = cache ? join(cache, `kotlinc-java-${sha(kotlincPath)}.txt`) : null
  if (memo && existsSync(memo)) {
    const j = readFileSync(memo, 'utf8').trim()
    if (j && runnable(j)) return j
  }
  // kotlinc prints both the settings and its version on STDERR and exits 0,
  // so read both streams rather than trusting either.
  const probe = spawnSync('kotlinc', ['-J-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  })
  const home = /java\.home\s*=\s*(\S+)/.exec(`${probe.stderr ?? ''}\n${probe.stdout ?? ''}`)?.[1]
  const fromKotlinc = home
    ? join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : null
  if (fromKotlinc && runnable(fromKotlinc)) {
    if (memo) writeFileSync(memo, fromKotlinc, 'utf8')
    return fromKotlinc
  }
  return runnable('java') ? 'java' : null
}

/** Where built artefacts (server jar, stubs jars) live: the verdict cache, else the spool. */
function artefactDir(spool: string): string {
  return cacheDir() ?? spool
}

/** Compile the embedded server once per (server source, kotlinc version). */
function serverJar(kotlincVersion: string, libDir: string, spool: string): string {
  const dir = artefactDir(spool)
  const jar = join(dir, `kotlin-daemon-${sha(KOTLIN_DAEMON_SERVER_KT, kotlincVersion)}.jar`)
  if (existsSync(jar)) return jar
  const work = mkdtempSync(join(tmpdir(), 'pyreon-kotlin-daemon-build-'))
  try {
    const src = join(work, 'Server.kt')
    writeFileSync(src, KOTLIN_DAEMON_SERVER_KT, 'utf8')
    const tmpJar = join(work, 'server.jar')
    execFileSync(
      'kotlinc',
      ['-nowarn', '-cp', join(libDir, 'kotlin-compiler.jar'), src, '-d', tmpJar],
      {
        stdio: 'pipe',
        timeout: 180_000,
      },
    )
    mkdirSync(dir, { recursive: true })
    renameSync(tmpJar, jar)
    return jar
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function stopDaemon(d: Daemon): void {
  // An attached daemon belongs to the run (globalSetup); only its owner
  // kills it and removes the spool.
  if (!d.owned) return
  try {
    d.child?.kill()
  } catch {
    // Already gone.
  }
  try {
    rmSync(d.spool, { recursive: true, force: true })
  } catch {
    // Best effort.
  }
}

function disable(reason: string): null {
  const s = slot()
  if (s.daemon) stopDaemon(s.daemon)
  s.daemon = null
  s.disabled = reason
  // An explicit opt-out is not news; every other reason is printed once.
  if (!s.announced && reason !== 'PYREON_KOTLIN_DAEMON=0') {
    s.announced = true
    process.stderr.write(
      `[pyreon] kotlin daemon unavailable — ${reason}; validating with one kotlinc per check\n`,
    )
  }
  return null
}

/**
 * Spawn a compiler JVM owned by THIS process. Returns the daemon, or the
 * reason it could not start.
 */
function spawnDaemon(kotlincVersion: string): Daemon | string {
  const libDir = kotlinLibDir()
  if (!libDir) return 'kotlin-compiler.jar not found beside kotlinc (set KOTLIN_HOME)'
  const java = javaCommand()
  if (!java) return 'no runnable java (set JAVACMD or JAVA_HOME)'

  const spool = mkdtempSync(join(tmpdir(), 'pyreon-kotlin-daemon-'))
  let jar: string
  try {
    jar = serverJar(kotlincVersion, libDir, spool)
  } catch (err) {
    rmSync(spool, { recursive: true, force: true })
    return `server did not compile: ${(err as Error).message.split('\n')[0]}`
  }

  const cp = [
    jar,
    join(libDir, 'kotlin-compiler.jar'),
    join(libDir, 'kotlin-stdlib.jar'),
    join(libDir, 'kotlin-reflect.jar'),
    join(libDir, 'kotlin-script-runtime.jar'),
  ].join(process.platform === 'win32' ? ';' : ':')
  const child = spawn(java, ['-Xss4m', '-XX:+UseSerialGC', '-cp', cp, 'ServerKt', spool], {
    stdio: ['pipe', 'ignore', 'pipe'],
  })
  const d: Daemon = { child, pid: child.pid ?? -1, spool, seq: 0, libDir, stderr: [], owned: true }
  child.stderr?.on('data', (b: Buffer) => {
    d.stderr.push(b.toString('utf8'))
    if (d.stderr.length > 50) d.stderr.shift()
  })
  child.on('error', () => {
    /* surfaced through exitCode/readiness below */
  })
  process.once('exit', () => stopDaemon(d))

  // A cold JVM under CI load can take a while to report; the verdict cache's
  // probe budget (60s) is the documented worst case for `kotlinc -version`.
  const ready = join(spool, 'ready')
  const deadline = Date.now() + 60_000
  while (!existsSync(ready)) {
    if (child.exitCode !== null || Date.now() > deadline) {
      const why =
        child.exitCode !== null
          ? `exited ${child.exitCode} before ready`
          : 'never reported ready in 60s'
      const tail = d.stderr.join('').trim().split('\n').slice(-3).join(' | ')
      stopDaemon(d)
      return `${why}${tail ? ` (${tail})` : ''}`
    }
    sleep(5)
  }
  return d
}

/**
 * Attach to a run-wide daemon another process started (vitest globalSetup
 * hands its spool down through `SHARED_SPOOL_ENV`). Null when there is none
 * or it is no longer alive — the caller then spawns its own.
 */
function attachShared(): Daemon | null {
  const spool = process.env[SHARED_SPOOL_ENV]
  if (!spool || !existsSync(join(spool, 'ready'))) return null
  const libDir = kotlinLibDir()
  if (!libDir) return null
  let pid = -1
  try {
    pid = Number(readFileSync(join(spool, 'pid'), 'utf8').trim())
  } catch {
    return null
  }
  const d: Daemon = { child: null, pid, spool, seq: 0, libDir, stderr: [], owned: false }
  return alive(d) ? d : null
}

/** Start (or return) this process's daemon; null when it cannot run here. */
function daemon(kotlincVersion: string): Daemon | null {
  const s = slot()
  if (s.disabled) return null
  if (s.daemon && alive(s.daemon)) return s.daemon
  if (process.env.PYREON_KOTLIN_DAEMON === '0') return disable('PYREON_KOTLIN_DAEMON=0')
  const shared = attachShared()
  if (shared) {
    s.daemon = shared
    return shared
  }
  const own = spawnDaemon(kotlincVersion)
  if (typeof own === 'string') return disable(own)
  s.daemon = own
  return own
}

/**
 * Start ONE daemon for a whole test run and return its spool, for a vitest
 * `globalSetup` to publish through `SHARED_SPOOL_ENV` before workers fork.
 * Vitest's forks pool starts a fresh process per test file, so a per-process
 * daemon would pay a JVM start and a cold first compile per FILE (~3s each,
 * measured 2x faster than plain kotlinc where 50x was available); one shared
 * JVM pays them once per run. The stubs jar is built here too, so workers
 * never race to build it. Returns null (with the reason) when it cannot run;
 * workers then spawn their own or fall back, exactly as without a setup.
 */
export function startSharedKotlinDaemon(
  kotlincVersion: string,
  stubs: string,
  timeoutMs: number,
): { spool: string; stop: () => void } | { reason: string } {
  const own = spawnDaemon(kotlincVersion)
  if (typeof own === 'string') return { reason: own }
  const jar = stubsJar(own, stubs, kotlincVersion, timeoutMs)
  if (!jar) {
    stopDaemon(own)
    return { reason: 'the Compose stubs did not compile' }
  }
  return { spool: own.spool, stop: () => stopDaemon(own) }
}

/**
 * One compile through the daemon. `files` are absolute `.kt` paths; `cp` is
 * the extra classpath (the stubs jar); `out` is where classes go. Returns
 * null when the daemon is unavailable or the request timed out — the caller
 * then falls back to `kotlinc`.
 */
function request(
  d: Daemon,
  out: string,
  cp: string,
  files: string[],
  timeoutMs: number,
): DaemonVerdict | null {
  // Several worker processes may share one daemon: the pid keeps names unique.
  const name = `${String(process.pid).padStart(8, '0')}-${String(++d.seq).padStart(8, '0')}`
  const req = join(d.spool, `${name}.req`)
  const res = join(d.spool, `${name}.res`)
  const cpAll = [cp, join(d.libDir, 'kotlin-stdlib.jar')]
    .filter(Boolean)
    .join(process.platform === 'win32' ? ';' : ':')
  writeFileSync(`${req}.tmp`, `${out}${FS}${cpAll}${FS}${files.join(LS)}`, 'utf8')
  renameSync(`${req}.tmp`, req)
  const deadline = Date.now() + timeoutMs
  while (!existsSync(res)) {
    if (!alive(d)) {
      disable('daemon died mid-request')
      return null
    }
    if (Date.now() > deadline) {
      disable(`request exceeded ${timeoutMs}ms`)
      return null
    }
    sleep(1)
  }
  const body = readFileSync(res, 'utf8')
  try {
    unlinkSync(res)
  } catch {
    // Best effort.
  }
  const nl = body.indexOf('\n')
  const code = Number(body.slice(0, nl))
  const output = body.slice(nl + 1)
  if (!Number.isInteger(code) || code >= 2) {
    disable(`compiler error inside the daemon: ${output.trim().split('\n')[0] || `exit ${code}`}`)
    return null
  }
  return { code, output }
}

/**
 * The stubs compiled once per (stubs text, kotlinc version) into a jar.
 * Returns null when the stubs themselves do not compile — which is a real
 * finding the plain path will report with kotlinc's own diagnostics.
 */
function stubsJar(
  d: Daemon,
  stubs: string,
  kotlincVersion: string,
  timeoutMs: number,
): string | null {
  const dir = artefactDir(d.spool)
  const jar = join(dir, `kotlin-stubs-${sha(stubs, kotlincVersion)}.jar`)
  if (existsSync(jar)) return jar
  const work = mkdtempSync(join(tmpdir(), 'pyreon-kotlin-stubs-'))
  try {
    const src = join(work, 'PyreonStubs.kt')
    writeFileSync(src, stubs, 'utf8')
    const tmpJar = join(work, 'stubs.jar')
    const v = request(d, tmpJar, '', [src], timeoutMs)
    if (!v || v.code !== 0) return null
    mkdirSync(dir, { recursive: true })
    renameSync(tmpJar, jar)
    return jar
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/**
 * Validate `source` against `stubs` through the warm compiler.
 *
 * `augmentation` is extra stub SOURCE a particular input needs (the chart
 * engine, for a chart-host emit) — it varies per input, so it is compiled
 * beside the input rather than into the jar. Returns null whenever the
 * daemon cannot answer; the caller falls back to `kotlinc` and the verdict
 * is the same either way.
 */
export function compileKotlinViaDaemon(
  source: string,
  stubs: string,
  augmentation: string,
  kotlincVersion: string,
  timeoutMs: number,
): DaemonVerdict | null {
  const d = daemon(kotlincVersion)
  if (!d) return null
  const jar = stubsJar(d, stubs, kotlincVersion, timeoutMs)
  if (!jar) return null
  const work = mkdtempSync(join(tmpdir(), 'pyreon-kotlin-check-'))
  try {
    const input = join(work, 'Input.kt')
    writeFileSync(input, source, 'utf8')
    const files = [input]
    if (augmentation) {
      const aug = join(work, 'PyreonStubsAugmentation.kt')
      writeFileSync(aug, augmentation, 'utf8')
      files.unshift(aug)
    }
    return request(d, join(work, 'out'), jar, files, timeoutMs)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
