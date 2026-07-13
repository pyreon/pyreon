#!/usr/bin/env bun
/**
 * verify-kotlin.ts — typecheck-validate the PyreonStorage.kt source
 * against kotlinc + the minimum-viable Compose + kotlinx-serialization
 * stubs needed for compilation.
 *
 * Why this instead of Gradle: the runtime-kotlin package intentionally
 * has no Android-SDK dependency — that would require contributors to
 * install Android Studio + a full Android emulator just to verify a
 * Kotlin source file parses. `kotlinc` is enough to validate the
 * type-level surface (the same gate the @pyreon/native-compiler
 * validate-kotlin tests use for the compiler-emitted Compose code).
 *
 * Stubs are split into multiple files, each declaring the real package
 * the runtime imports from. This lets PyreonStorage.kt's `import
 * androidx.compose.runtime.Composable` etc. resolve cleanly.
 *
 * ## Modes
 *
 * - **default (build / test)**: full path — compiles to a runnable JAR
 *   with `-include-runtime` (so the Kotlin stdlib is bundled), then
 *   runs the smoke `main()` when Java is available. Slower (~15-30s
 *   locally; can hit 60s+ under CI parallel-load contention) but
 *   exercises the runtime contract.
 *
 * - **`--typecheck-only`**: light path — runs kotlinc as a
 *   typecheck-only step (no `-include-runtime`, no JAR bundling, no
 *   smoke run). ~3-5x faster, safe to run under CI parallel-load.
 *   Used by the workspace `typecheck` script to avoid the 3-minute
 *   CI timeout that the full path hits when many packages typecheck
 *   in parallel.
 *
 * Skipped gracefully when `kotlinc` is absent (CI runners without the
 * Kotlin toolchain, etc.) so the workspace test script doesn't break
 * on cross-platform setups.
 */

import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(HERE, '..')

// Which runtime service to verify. Each service is `<Name>.kt` +
// `<Name>Test.kt`; `--service=<Name>` selects it (default PyreonStorage,
// back-compat). Each service compiles into its OWN JAR and runs its OWN
// `main()`, so multiple services with their own smoke entry points don't
// collide. The workspace `test` script invokes this once per service.
const SERVICE =
  process.argv.find((a) => a.startsWith('--service='))?.split('=')[1] ?? 'PyreonStorage'
const SOURCE_FILE = resolve(PACKAGE_ROOT, `src/main/kotlin/com/pyreon/runtime/${SERVICE}.kt`)
const TEST_FILE = resolve(PACKAGE_ROOT, `src/test/kotlin/com/pyreon/runtime/${SERVICE}Test.kt`)

// CLI: `bun verify-kotlin.ts` runs the full path; `bun verify-kotlin.ts
// --typecheck-only` skips the JAR bundling + smoke run (used by the
// workspace `typecheck` script to avoid CI parallel-load timeouts).
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

// Stubs split by real package — each file mocks just enough of the
// real API for the typechecker to accept the runtime source as
// well-typed. NOT runtime replacements.

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
fun <T> remember(key: Any?, calculation: () -> T): T = calculation()
`

const KOTLINX_SERIALIZATION_STUBS = `package kotlinx.serialization

abstract class KSerializer<T> {
  abstract val descriptor: Any
}

inline fun <reified T> serializer(): KSerializer<T> {
  @Suppress("UNCHECKED_CAST")
  return object : KSerializer<T>() {
    override val descriptor: Any = "stub-" + T::class.qualifiedName
  } as KSerializer<T>
}

// Mirrors the REAL kotlinx-serialization JVM signature:
//   public fun serializer(type: java.lang.reflect.Type): KSerializer<Any>
// — NON-generic. The previous stub declared a generic
// \`fun <T> serializer(cls: Class<*>): KSerializer<T>\` that does not
// exist upstream, so \`serializer<Any>(x)\` verified green here while
// real kotlinc (device CI's gradle compile of the example apps)
// rejected it with "none of the following candidates is applicable".
// Stub-vs-real signature drift — keep this byte-aligned with the
// upstream declaration.
@Suppress("UNUSED_PARAMETER")
fun serializer(type: java.lang.reflect.Type): KSerializer<Any> {
  return object : KSerializer<Any>() {
    override val descriptor: Any = "stub-runtime"
  }
}
`

const KOTLINX_SERIALIZATION_JSON_STUBS = `package kotlinx.serialization.json

import kotlinx.serialization.KSerializer

object Json {
  @Suppress("UNUSED_PARAMETER")
  inline fun <reified T> encodeToString(value: T): String = value.toString()

  @Suppress("UNUSED_PARAMETER")
  fun <T> encodeToString(serializer: KSerializer<T>, value: T): String = value.toString()

  @Suppress("UNCHECKED_CAST", "UNUSED_PARAMETER")
  inline fun <reified T> decodeFromString(value: String): T = (null as Any?) as T

  @Suppress("UNCHECKED_CAST", "UNUSED_PARAMETER")
  fun <T> decodeFromString(serializer: KSerializer<T>, value: String): T = (null as Any?) as T
}
`

// PyreonClipboard-specific stubs — Android Context + ClipboardManager
// + ContextCompat + kotlinx.coroutines. PyreonClipboard.kt is the only
// runtime file pulling in these surfaces (verified via grep against
// all 6 runtime files), so the stubs are gated behind `--service=
// PyreonClipboard` to keep the other services' verify runs fast.
const ANDROID_CONTENT_STUBS = `package android.content

open class Context {
  open fun getApplicationContext(): Context = this
}

class ClipData {
  companion object {
    @Suppress("UNUSED_PARAMETER")
    fun newPlainText(label: CharSequence, text: CharSequence): ClipData = ClipData()
  }
}

interface ClipboardManager {
  @Suppress("UNUSED_PARAMETER")
  fun setPrimaryClip(clip: ClipData)
}
`

const ANDROIDX_CORE_CONTENT_STUBS = `package androidx.core.content

import android.content.Context

object ContextCompat {
  @Suppress("UNUSED_PARAMETER")
  fun <T : Any> getSystemService(context: Context, serviceClass: Class<T>): T? = null
}
`

// PyreonHaptics-specific stubs — the Compose haptic-feedback surface
// PyreonHaptics.kt uses, mirrored EXACTLY (no superset — a superset stub
// masks; the rule kotlin-stubs.ts documents 4×). Real Compose ships
// `HapticFeedback` as an interface + `HapticFeedbackType` with companion
// `LongPress` / `TextHandleMove` vals (the only two the runtime maps to).
// Gated behind --service=PyreonHaptics.
const ANDROIDX_COMPOSE_HAPTIC_STUBS = `package androidx.compose.ui.hapticfeedback

class HapticFeedbackType {
  companion object {
    val LongPress = HapticFeedbackType()
    val TextHandleMove = HapticFeedbackType()
  }
}

interface HapticFeedback {
  fun performHapticFeedback(hapticFeedbackType: HapticFeedbackType)
}
`

// PyreonShare-specific stubs — the android.content.Context + Intent
// surface PyreonShare.kt uses, mirrored EXACTLY (no superset — a superset
// stub masks; the rule kotlin-stubs.ts documents 4×). Gated behind
// --service=PyreonShare. Own copy of Context (with startActivity) rather
// than reusing ANDROID_CONTENT_STUBS — that one carries clipboard-only
// members; per-service stubs stay minimal + independent.
const ANDROID_SHARE_STUBS = `package android.content

open class Context {
  @Suppress("UNUSED_PARAMETER")
  open fun startActivity(intent: Intent) {}
}

class Intent {
  companion object {
    const val ACTION_SEND = "android.intent.action.SEND"
    const val EXTRA_TEXT = "android.intent.extra.TEXT"
    const val FLAG_ACTIVITY_NEW_TASK = 0
    @Suppress("UNUSED_PARAMETER")
    fun createChooser(target: Intent, title: CharSequence?): Intent = Intent()
  }
  constructor()
  @Suppress("UNUSED_PARAMETER")
  constructor(action: String)
  var type: String? = null
  @Suppress("UNUSED_PARAMETER")
  fun putExtra(name: String, value: String): Intent = this
  @Suppress("UNUSED_PARAMETER")
  fun addFlags(flags: Int): Intent = this
}
`

// PyreonWebSocketOkHttp-specific stubs — the okhttp3 4.x surface the
// transport file uses, mirrored EXACTLY (no superset — a superset stub
// masks; the same rule the compiler's kotlin-stubs.ts documents 4×).
// Gated behind --service=PyreonWebSocketOkHttp.
const OKHTTP3_STUBS = `package okhttp3

open class OkHttpClient {
    fun newWebSocket(request: Request, listener: WebSocketListener): WebSocket =
        throw UnsupportedOperationException("stub")
}

class Request private constructor() {
    class Builder {
        fun url(url: String): Builder = this
        fun build(): Request = throw UnsupportedOperationException("stub")
    }
}

class Response

interface WebSocket {
    fun send(text: String): Boolean
    fun close(code: Int, reason: String?): Boolean
}

abstract class WebSocketListener {
    open fun onOpen(webSocket: WebSocket, response: Response) {}
    open fun onMessage(webSocket: WebSocket, text: String) {}
    open fun onClosing(webSocket: WebSocket, code: Int, reason: String) {}
    open fun onClosed(webSocket: WebSocket, code: Int, reason: String) {}
    open fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {}
}
`

const KOTLINX_COROUTINES_STUBS = `package kotlinx.coroutines

import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext

interface CoroutineContextElement : CoroutineContext.Element
abstract class CoroutineDispatcher : CoroutineContext.Element {
  override val key: CoroutineContext.Key<*> get() = Key
  companion object Key : CoroutineContext.Key<CoroutineDispatcher>
}

object Dispatchers {
  val IO: CoroutineDispatcher = object : CoroutineDispatcher() {}
  val Main: CoroutineDispatcher = object : CoroutineDispatcher() {}
  val Unconfined: CoroutineDispatcher = object : CoroutineDispatcher() {}
  val Default: CoroutineDispatcher = object : CoroutineDispatcher() {}
}

interface Job {
  fun cancel()
}

@Suppress("UNUSED_PARAMETER")
class CoroutineScope(context: CoroutineContext = EmptyCoroutineContext)

// Real kotlinx.coroutines: \`launch\` is an EXTENSION function on
// CoroutineScope whose block has a CoroutineScope receiver — \`fun
// CoroutineScope.launch(block: suspend CoroutineScope.() -> Unit)\`.
// Stubbing it as a member function with a plain \`suspend () -> Unit\`
// block makes kotlinc reject \`scope.launch { delay(...); ... }\`
// because the trailing-closure lambda type doesn't match. Mirror
// the real shape (extension + CoroutineScope receiver) so the call
// site resolves.
@Suppress("UNUSED_PARAMETER")
fun CoroutineScope.launch(block: suspend CoroutineScope.() -> Unit): Job {
  // Stub no-op — tests should NOT depend on the body actually
  // running (the 2s reset timing is covered by Swift's
  // PyreonRuntimeTests). delay() in the body is also stubbed as
  // a no-op so the body would complete instantly if it did run.
  return object : Job { override fun cancel() {} }
}

@Suppress("UNUSED_PARAMETER")
suspend fun delay(timeMillis: Long) { /* no-op stub */ }
`

const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-kotlin-runtime-verify-'))

try {
  const composeRuntimePath = join(tempDir, 'ComposeRuntime.kt')
  const kotlinxSerializationPath = join(tempDir, 'KotlinxSerialization.kt')
  const kotlinxSerializationJsonPath = join(tempDir, 'KotlinxSerializationJson.kt')
  // Per-service Android/coroutines stubs (Clipboard-only)
  const androidContentPath = join(tempDir, 'AndroidContent.kt')
  const androidxCoreContentPath = join(tempDir, 'AndroidxCoreContent.kt')
  const kotlinxCoroutinesPath = join(tempDir, 'KotlinxCoroutines.kt')

  writeFileSync(composeRuntimePath, COMPOSE_RUNTIME_STUBS, 'utf8')
  writeFileSync(kotlinxSerializationPath, KOTLINX_SERIALIZATION_STUBS, 'utf8')
  writeFileSync(kotlinxSerializationJsonPath, KOTLINX_SERIALIZATION_JSON_STUBS, 'utf8')
  if (SERVICE === 'PyreonClipboard') {
    writeFileSync(androidContentPath, ANDROID_CONTENT_STUBS, 'utf8')
    writeFileSync(androidxCoreContentPath, ANDROIDX_CORE_CONTENT_STUBS, 'utf8')
    writeFileSync(kotlinxCoroutinesPath, KOTLINX_COROUTINES_STUBS, 'utf8')
  }
  const hapticFeedbackPath = join(tempDir, 'AndroidxComposeHaptic.kt')
  if (SERVICE === 'PyreonHaptics') {
    writeFileSync(hapticFeedbackPath, ANDROIDX_COMPOSE_HAPTIC_STUBS, 'utf8')
  }
  const shareIntentPath = join(tempDir, 'AndroidContentShare.kt')
  if (SERVICE === 'PyreonShare') {
    writeFileSync(shareIntentPath, ANDROID_SHARE_STUBS, 'utf8')
  }
  const okhttpPath = join(tempDir, 'OkHttp3.kt')
  if (SERVICE === 'PyreonWebSocketOkHttp') {
    writeFileSync(okhttpPath, OKHTTP3_STUBS, 'utf8')
  }

  const jarPath = join(tempDir, 'pyreon-runtime.jar')

  console.log(`[verify-kotlin] kotlinc: ${kotlinc}`)
  console.log(`[verify-kotlin] mode: ${typecheckOnly ? 'typecheck-only' : 'full (build + smoke)'}`)
  console.log(`[verify-kotlin] source: ${SOURCE_FILE}`)
  if (!typecheckOnly) console.log(`[verify-kotlin] test:   ${TEST_FILE}`)
  console.log(`[verify-kotlin] stubs:  ${tempDir}/ (3 files)`)

  // kotlinc args:
  //   - full mode: `-include-runtime` + JAR output + smoke test source.
  //     The Kotlin stdlib gets bundled into the JAR so `java -jar`
  //     can run the smoke `main()`. Slower (~15-30s locally) but
  //     exercises the runtime contract.
  //   - typecheck-only mode: NO `-include-runtime`, output goes to a
  //     `.class` dir (not a JAR), smoke test source SKIPPED. Pure
  //     type-check pass. ~3-5x faster.
  // PyreonClipboard-only stub sources (Android Context + ContextCompat
  // + kotlinx.coroutines). Other services don't need these; passing
  // them unconditionally would just bloat the compile.
  const clipboardStubs =
    SERVICE === 'PyreonClipboard'
      ? [androidContentPath, androidxCoreContentPath, kotlinxCoroutinesPath]
      : []
  // PyreonHaptics-only stub source (the Compose hapticfeedback package).
  const hapticStubs = SERVICE === 'PyreonHaptics' ? [hapticFeedbackPath] : []
  const shareStubs = SERVICE === 'PyreonShare' ? [shareIntentPath] : []
  // The OkHttp transport is an EXTENSION over the core container — its
  // compile needs the sibling PyreonWebSocket.kt source + the okhttp3 stubs.
  const okhttpExtras =
    SERVICE === 'PyreonWebSocketOkHttp'
      ? [okhttpPath, resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonWebSocket.kt')]
      : []

  const kotlincArgs = typecheckOnly
    ? [
        '-d', tempDir,
        composeRuntimePath,
        kotlinxSerializationPath,
        kotlinxSerializationJsonPath,
        ...clipboardStubs,
        ...hapticStubs,
        ...shareStubs,
        ...okhttpExtras,
        SOURCE_FILE,
      ]
    : [
        '-include-runtime',
        '-d', jarPath,
        composeRuntimePath,
        kotlinxSerializationPath,
        kotlinxSerializationJsonPath,
        ...clipboardStubs,
        ...hapticStubs,
        ...shareStubs,
        ...okhttpExtras,
        SOURCE_FILE,
        TEST_FILE,
      ]

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
      ? `[verify-kotlin] ✓ ${SERVICE}.kt typechecks against stubs`
      : `[verify-kotlin] ✓ ${SERVICE}.kt + test smoke typecheck against stubs`,
  )

  // Typecheck-only mode stops here — no JAR was built, no smoke to run.
  if (typecheckOnly) process.exit(0)

  // Full mode: run the smoke main() — proves the InMemoryBackend
  // round-trips and the PyreonStorageRegistry default is wired
  // correctly. Catches bugs that pass type-check but break runtime
  // contract (e.g. the registry shipping null, or InMemoryBackend's
  // map being immutable).
  // macOS ships a /usr/bin/java stub that exits with an install prompt
  // when no JRE is present — `command -v java` returns the path but
  // execution fails. Verify with a real `java -version` probe.
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
      ['-jar', jarPath, `com.pyreon.runtime.${SERVICE}TestKt`],
      { encoding: 'utf8' },
    )
    if (smokeResult.status !== 0) {
      console.error('[verify-kotlin] FAILED — smoke main() exited non-zero')
      console.error(smokeResult.stderr ?? '')
      console.error(smokeResult.stdout ?? '')
      process.exit(1)
    }
    console.log(`[verify-kotlin] ✓ smoke: ${(smokeResult.stdout ?? '').trim()}`)
  }
} finally {
  try {
    rmSync(tempDir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
}
