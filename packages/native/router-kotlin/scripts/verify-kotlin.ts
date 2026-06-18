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
 * - PyreonRouter.kt (imperative model, NON-Composable)
 * - RouterProvider.kt (@Composable wrapper, CompositionLocal)
 * - RouterView.kt (@Composable placeholder)
 * - Link.kt (@Composable navigation primitive)
 * - Hooks.kt (@Composable useNavigate/useParams)
 * - PyreonRouterTest.kt (top-level main() smoke runner)
 *
 * The smoke main() exercises ONLY the imperative model (push /
 * replace / back / reset / params reactivity) — Composable surface
 * is validated by type-check alone since running Compose requires
 * an Android runtime.
 */

import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(HERE, '..')

const SOURCES = [
  'src/main/kotlin/com/pyreon/router/PyreonRouter.kt',
  'src/main/kotlin/com/pyreon/router/RouterProvider.kt',
  'src/main/kotlin/com/pyreon/router/RouterView.kt',
  'src/main/kotlin/com/pyreon/router/Link.kt',
  'src/main/kotlin/com/pyreon/router/Hooks.kt',
  'src/main/kotlin/com/pyreon/router/RouteLoader.kt',
].map(rel => resolve(PACKAGE_ROOT, rel))

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

const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-router-kotlin-verify-'))

try {
  const composeRuntimePath = join(tempDir, 'ComposeRuntime.kt')
  writeFileSync(composeRuntimePath, COMPOSE_RUNTIME_STUBS, 'utf8')

  const jarPath = join(tempDir, 'pyreon-router.jar')

  console.log(`[verify-kotlin] kotlinc: ${kotlinc}`)
  console.log(`[verify-kotlin] mode: ${typecheckOnly ? 'typecheck-only' : 'full (build + smoke)'}`)
  console.log(`[verify-kotlin] sources: ${SOURCES.length} files`)
  if (!typecheckOnly) console.log(`[verify-kotlin] test: ${TEST_FILE}`)
  console.log(`[verify-kotlin] stubs: ${tempDir}/ (1 file)`)

  const kotlincArgs = typecheckOnly
    ? ['-d', tempDir, composeRuntimePath, ...SOURCES]
    : ['-include-runtime', '-d', jarPath, composeRuntimePath, ...SOURCES, TEST_FILE]

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
