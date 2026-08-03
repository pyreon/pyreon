#!/usr/bin/env bun
/**
 * verify-kotlin.ts — typecheck-validate the router Kotlin sources
 * against kotlinc + the minimum-viable Compose stubs needed for
 * compilation.
 *
 * Mirrors the parallel script in @pyreon/native-runtime-kotlin —
 * same kotlinc-against-minimal-stubs approach, same gracefully-skip-
 * if-no-kotlinc behaviour, same `--typecheck-only` mode for CI.
 *
 * ## What gets validated
 *
 * EVERY .kt under src/main/kotlin/com/pyreon/router (discovered by glob —
 * a hand-maintained list silently excluded PyreonDeepLink.kt the first
 * time a file was added), plus PyreonRouterTest.kt (top-level main()
 * smoke runner).
 *
 * The smoke main() exercises ONLY the imperative model (push /
 * replace / back / reset / params reactivity) — Composable surface
 * is validated by type-check alone since running Compose requires
 * an Android runtime.
 */

import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(HERE, '..')

// EVERY .kt under the module's source root — discovered, not enumerated.
// This was a hardcoded six-file list, and the first new source file added
// after it (PyreonDeepLink.kt) was silently excluded: PyreonRouter.kt
// references the class, so kotlinc failed with "unresolved reference" in a
// file that compiles fine in any real Gradle build, and the red run read as a
// product bug. A gate whose input set is a hand-maintained list fails
// exactly when a file is ADDED — the moment it has something new to check.
// (Same family as ".claude/rules"'s "per-file gate cannot see cross-file
// collision": narrowing a gate's input set makes questions unanswerable.)
const SOURCE_DIR = resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/router')
const SOURCES = readdirSync(SOURCE_DIR)
  .filter((f) => f.endsWith('.kt'))
  .sort()
  .map((f) => resolve(SOURCE_DIR, f))
if (SOURCES.length === 0) {
  // An empty scan must be a loud failure, never a vacuous green.
  console.error('[verify-kotlin] FAILED — no .kt sources found under', SOURCE_DIR)
  process.exit(1)
}

const TEST_FILE = resolve(
  PACKAGE_ROOT,
  'src/test/kotlin/com/pyreon/router/PyreonRouterTest.kt',
)

const typecheckOnly = process.argv.includes('--typecheck-only')

const kotlinc = (() => {
  try {
    return execSync('command -v kotlinc', { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
})()

if (!kotlinc) {
  console.log('[verify-kotlin] kotlinc not on PATH; skipping verification')
  process.exit(0)
}

// Stubs split by real package so the router imports resolve cleanly.
// Same shape as @pyreon/native-runtime-kotlin's verify-kotlin.ts —
// covers JUST the symbols the router actually references.

const COMPOSE_RUNTIME_STUBS = `package androidx.compose.runtime

@Target(
  AnnotationTarget.FUNCTION,
  AnnotationTarget.TYPE,
  AnnotationTarget.TYPE_PARAMETER,
  AnnotationTarget.PROPERTY_GETTER,
)
@Retention(AnnotationRetention.SOURCE)
annotation class Composable

abstract class State<out T> {
  abstract val value: T
}

interface MutableState<T> {
  var value: T
  operator fun component1(): T
  operator fun component2(): (T) -> Unit
}

class MutableStateImpl<T>(initial: T) : MutableState<T> {
  override var value: T = initial
  override fun component1(): T = value
  override fun component2(): (T) -> Unit = { value = it }
}

inline operator fun <T> State<T>.getValue(
  thisRef: Any?,
  property: kotlin.reflect.KProperty<*>,
): T = value

inline operator fun <T> MutableState<T>.getValue(
  thisRef: Any?,
  property: kotlin.reflect.KProperty<*>,
): T = value

inline operator fun <T> MutableState<T>.setValue(
  thisRef: Any?,
  property: kotlin.reflect.KProperty<*>,
  newValue: T,
) {
  value = newValue
}

fun <T> mutableStateOf(initial: T): MutableState<T> = MutableStateImpl(initial)

@Composable
fun <T> rememberUpdatedState(value: T): State<T> = object : State<T>() {
  override val value: T = value
}

// LaunchedEffect — RouteLoader.kt fires its loader inside a
// LaunchedEffect(path) { … } so the loader runs once on enter-composition.
@Composable
fun LaunchedEffect(key1: Any?, block: suspend () -> Unit) {}

// CompositionLocal stub — just enough for the router's
// LocalPyreonRouter declaration + .current reads to typecheck.
abstract class CompositionLocal<T> {
  abstract val current: T
}

abstract class ProvidableCompositionLocal<T> : CompositionLocal<T>() {
  abstract infix fun provides(value: T): ProvidedValue<T>
}

class ProvidedValue<T>(val value: T)

class ProvidableCompositionLocalImpl<T>(private val defaultFactory: () -> T) : ProvidableCompositionLocal<T>() {
  override val current: T get() = defaultFactory()
  override infix fun provides(value: T): ProvidedValue<T> = ProvidedValue(value)
}

fun <T> compositionLocalOf(defaultFactory: () -> T): ProvidableCompositionLocal<T> =
  ProvidableCompositionLocalImpl(defaultFactory)

@Composable
@Suppress("UNUSED_PARAMETER")
fun CompositionLocalProvider(vararg values: ProvidedValue<*>, content: @Composable () -> Unit) {
  content()
}
`

// android.net.Uri — EXACTLY the surface PyreonDeepLink.kt reads
// (`uri.path` / `uri.host`, both nullable). Mirrored, not a superset:
// a wider stub would mask a reference the real SDK rejects (the
// stub-must-mirror rule), a narrower one manufactures failures — this
// gate found PyreonDeepLink at all only because the source list became
// a glob, and then needed exactly this stub.
const ANDROID_NET_STUBS = `package android.net

class Uri {
  val path: String? = null
  val host: String? = null
}
`

const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-router-kotlin-verify-'))

try {
  const composeRuntimePath = join(tempDir, 'ComposeRuntime.kt')
  writeFileSync(composeRuntimePath, COMPOSE_RUNTIME_STUBS, 'utf8')
  const androidNetPath = join(tempDir, 'AndroidNet.kt')
  writeFileSync(androidNetPath, ANDROID_NET_STUBS, 'utf8')

  const jarPath = join(tempDir, 'pyreon-router.jar')

  console.log(`[verify-kotlin] kotlinc: ${kotlinc}`)
  console.log(`[verify-kotlin] mode: ${typecheckOnly ? 'typecheck-only' : 'full (build + smoke)'}`)
  console.log(`[verify-kotlin] sources: ${SOURCES.length} files`)
  if (!typecheckOnly) console.log(`[verify-kotlin] test: ${TEST_FILE}`)
  console.log(`[verify-kotlin] stubs: ${tempDir}/ (2 files)`)

  const kotlincArgs = typecheckOnly
    ? ['-d', tempDir, composeRuntimePath, androidNetPath, ...SOURCES]
    : ['-include-runtime', '-d', jarPath, composeRuntimePath, androidNetPath, ...SOURCES, TEST_FILE]

  const result = spawnSync(kotlinc, kotlincArgs, { encoding: 'utf8' })

  const stderr = result.stderr ?? ''
  const errorLines = stderr
    .split('\n')
    .filter((line) => /^.*\.kt:\d+:\d+:\s*error:/.test(line))

  if (errorLines.length > 0) {
    console.error('[verify-kotlin] FAILED — kotlinc reported errors:')
    for (const line of errorLines) console.error(`  ${line}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error('[verify-kotlin] FAILED — kotlinc exited non-zero')
    console.error(stderr)
    process.exit(1)
  }

  console.log(
    typecheckOnly
      ? '[verify-kotlin] ✓ PyreonRouter typechecks against stubs'
      : '[verify-kotlin] ✓ PyreonRouter + test smoke typecheck against stubs',
  )

  if (typecheckOnly) process.exit(0)

  const javaAvailable = (() => {
    try {
      const probe = spawnSync('java', ['-version'], { encoding: 'utf8' })
      return probe.status === 0
    } catch {
      return false
    }
  })()

  if (!javaAvailable) {
    console.log('[verify-kotlin] java not available; skipping smoke-run (typecheck passed)')
  } else {
    const smokeResult = spawnSync(
      'java',
      ['-jar', jarPath, 'com.pyreon.router.PyreonRouterTestKt'],
      { encoding: 'utf8' },
    )
    if (smokeResult.status !== 0) {
      console.error('[verify-kotlin] FAILED — smoke main() exited non-zero')
      console.error(smokeResult.stderr ?? '')
      console.error(smokeResult.stdout ?? '')
      process.exit(1)
    }
    console.log(`[verify-kotlin] smoke output:`)
    console.log((smokeResult.stdout ?? '').trim().split('\n').map(l => `  ${l}`).join('\n'))
  }
} finally {
  try {
    rmSync(tempDir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
}
