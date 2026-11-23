/**
 * A `java` that RUNS, or null — for anything that executes a jar: every Kotlin behaviour check,
 * the Kotlin runtime and router packages' smoke tests, `check-native-cosource`. (The compiler's kotlinc daemon keeps
 * its own resolver with the same order in `kotlin-daemon.ts`; it ships, and these are repo scripts.)
 *
 * Never spawn a bare `java`. On a Mac whose JDK is Homebrew's keg-only `openjdk`, `kotlinc` works (its wrapper script
 * sets `JAVA_HOME`) while `java` on PATH is the macOS stub that exits "Unable to locate a Java Runtime" — so a bare
 * `java` silently turned every Kotlin smoke test into a typecheck and crashed specs that had only checked for kotlinc.
 *
 * Order: `PYREON_JAVA` (resolved once by the test run's global setup and inherited by every test process; an empty
 * value means "none", and `java` restricts the search to PATH), `JAVACMD`, `JAVA_HOME`, `java` on PATH, the
 * well-known JDK locations (Homebrew's keg-only `openjdk`, macOS `java_home`) — cheap checks — and last the JVM
 * `kotlinc` ITSELF runs on (kotlinc names it: `-J` passes a flag to its JVM and `-XshowSettings:properties` prints
 * `java.home`), which starts a JVM (~3 s). Memoised per process.
 *
 * Self-contained (Node built-ins only): the strict-cache fixtures copy it beside the scripts that import it.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** The env var a resolved JDK is handed to child processes through (see the module doc). */
export const JAVA_ENV = 'PYREON_JAVA'

let resolved: { java: string | null } | undefined

function runnable(java: string): boolean {
  try {
    execFileSync(java, ['-version'], { stdio: 'ignore', timeout: 60_000 })
    return true
  } catch {
    return false
  }
}

/** `java.home` from kotlinc's `-XshowSettings:properties` output — to the end of the line (a path may hold spaces). */
export function parseJavaHome(settings: string): string | undefined {
  return /^\s*java\.home\s*=\s*(.+?)\s*$/m.exec(settings)?.[1]
}

/** Well-known JDK locations, cheapest first: no JVM is started to find them. */
function wellKnownJavas(): string[] {
  const out: string[] = []
  for (const root of ['/opt/homebrew/opt', '/usr/local/opt']) {
    if (!existsSync(root)) continue
    const kegs = readdirSync(root).filter((n) => n === 'openjdk' || n.startsWith('openjdk@'))
    for (const keg of kegs.sort().reverse()) out.push(join(root, keg, 'bin', 'java'))
  }
  if (process.platform === 'darwin' && existsSync('/usr/libexec/java_home')) {
    const home = spawnSync('/usr/libexec/java_home', [], { encoding: 'utf8', timeout: 10_000 })
    if (home.status === 0 && home.stdout.trim() !== '') out.push(join(home.stdout.trim(), 'bin', 'java'))
  }
  return out.filter((j) => existsSync(j))
}

/** The JVM `kotlinc` itself runs on, if it names one that runs. Starts a JVM, so it is the last resort. */
function kotlincJava(): string | null {
  // `-version` first: a JVM flag anywhere is passed through, and a probe that reads as a version query is never
  // mistaken for a compile. kotlinc prints the settings and its version on STDERR, so read both streams.
  const probe = spawnSync('kotlinc', ['-version', '-J-XshowSettings:properties'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  })
  const home = parseJavaHome(`${probe.stderr ?? ''}\n${probe.stdout ?? ''}`)
  const java = home ? join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : null

  return java !== null && runnable(java) ? java : null
}

function findJava(): string | null {
  const pinned = process.env[JAVA_ENV]
  if (pinned !== undefined) return pinned !== '' && runnable(pinned) ? pinned : null
  if (process.env.JAVACMD && runnable(process.env.JAVACMD)) return process.env.JAVACMD
  if (process.env.JAVA_HOME) {
    const j = join(process.env.JAVA_HOME, 'bin', 'java')
    if (runnable(j)) return j
  }
  if (runnable('java')) return 'java'
  const known = wellKnownJavas().find((j) => runnable(j))
  if (known !== undefined) return known

  return kotlincJava()
}

/** The first runnable `java` (see the module doc), or null. */
export function resolveJava(): string | null {
  resolved ??= { java: findJava() }

  return resolved.java
}
