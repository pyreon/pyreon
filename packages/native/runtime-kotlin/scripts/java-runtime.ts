/**
 * A `java` that RUNS, or null — for anything that executes a jar: every Kotlin behaviour check,
 * the Kotlin runtime and router packages' smoke tests, `check-native-cosource`. (The compiler's kotlinc daemon keeps
 * its own resolver with the same order in `kotlin-daemon.ts`; it ships, and these are repo scripts.)
 *
 * Never spawn a bare `java`. On a Mac whose JDK is Homebrew's keg-only `openjdk`, `kotlinc` works (its wrapper script
 * sets `JAVA_HOME`) while `java` on PATH is the macOS stub that exits "Unable to locate a Java Runtime" — so a bare
 * `java` silently turned every Kotlin smoke test into a typecheck and crashed specs that had only checked for kotlinc.
 *
 * Order: `JAVACMD`, `JAVA_HOME`, `java` on PATH, then the JVM `kotlinc` ITSELF runs on (kotlinc names it: `-J` passes a
 * flag to its JVM and `-XshowSettings:properties` prints `java.home`). Asking kotlinc starts a JVM, so the
 * answer is memoised per process and, given a directory, on disk per kotlinc binary.
 *
 * Self-contained (Node built-ins only): the strict-cache fixtures copy it beside the scripts that import it.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let resolved: { java: string | null } | undefined

function runnable(java: string): boolean {
  try {
    execFileSync(java, ['-version'], { stdio: 'ignore', timeout: 60_000 })
    return true
  } catch {
    return false
  }
}

/** The JVM `kotlinc` itself runs on, if it names one that runs. */
function kotlincJava(memoDir: string | null | undefined): string | null {
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
  const memo = memoDir
    ? join(memoDir, `kotlinc-java-${createHash('sha256').update(kotlincPath).digest('hex').slice(0, 24)}.txt`)
    : null
  if (memo && existsSync(memo)) {
    const j = readFileSync(memo, 'utf8').trim()
    if (j && runnable(j)) return j
  }
  // kotlinc prints both the settings and its version on STDERR and exits 0, so read both streams.
  // `-version` first: a JVM flag anywhere is passed through, and a probe that reads as a version query is never
  // mistaken for a compile.
  const probe = spawnSync('kotlinc', ['-version', '-J-XshowSettings:properties'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  })
  const home = /java\.home\s*=\s*(\S+)/.exec(`${probe.stderr ?? ''}\n${probe.stdout ?? ''}`)?.[1]
  const java = home ? join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : null
  if (java === null || !runnable(java)) return null
  // Owner-only: this file names an executable a later run will spawn.
  if (memo) writeFileSync(memo, java, { encoding: 'utf8', mode: 0o600 })

  return java
}

function findJava(memoDir: string | null | undefined): string | null {
  if (process.env.JAVACMD && runnable(process.env.JAVACMD)) return process.env.JAVACMD
  if (process.env.JAVA_HOME) {
    const j = join(process.env.JAVA_HOME, 'bin', 'java')
    if (runnable(j)) return j
  }
  if (runnable('java')) return 'java'

  return kotlincJava(memoDir)
}

/** The first runnable `java` (see the module doc), or null. `memoDir` persists the kotlinc answer across processes. */
export function resolveJava(memoDir?: string | null): string | null {
  resolved ??= { java: findJava(memoDir) }

  return resolved.java
}
