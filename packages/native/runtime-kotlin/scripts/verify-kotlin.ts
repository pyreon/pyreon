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

// DisposableEffect + its DisposableEffectScope — how a composable registers
// something with a teardown (the connectivity callback). Mirrors the real
// signature: the block RETURNS the disposal handle via onDispose.
class DisposableEffectResult
class DisposableEffectScope {
  fun onDispose(onDisposeEffect: () -> Unit): DisposableEffectResult = DisposableEffectResult()
}
@Suppress("UNUSED_PARAMETER")
fun DisposableEffect(key1: Any?, effect: DisposableEffectScope.() -> DisposableEffectResult) {
  DisposableEffectScope().effect()
}

// SnapshotStateList — the reactive list PyreonFieldArray builds on. The stub
// is FUNCTIONAL (a MutableList delegate), not type-only, because the
// PyreonFieldArray smoke test RUNS: append/remove/values must actually
// mutate. Mirrors the real surface the runtime touches (MutableList ops).
class SnapshotStateList<T> internal constructor(
  private val backing: MutableList<T>,
) : MutableList<T> by backing

fun <T> mutableStateListOf(vararg elements: T): SnapshotStateList<T> =
  SnapshotStateList(elements.toMutableList())

@Composable
fun <T> remember(key: Any?, calculation: () -> T): T = calculation()

// The keyless overload — real androidx.compose.runtime ships both; the
// geolocation composable uses \`remember { PyreonGeolocation() }\`.
@Composable
fun <T> remember(calculation: () -> T): T = calculation()
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

// The real kotlinx surface is BOTH: a \`Json\` object (the default instance)
// and a top-level \`Json(builderAction)\` FUNCTION returning a configured one.
// PyreonFetchJson uses the builder form, so the stub must carry both or the
// gate rejects correct code. Mirrored, not approximated — a stub that is a
// SUPERSET masks, and one that is a SUBSET manufactures failures.
class JsonBuilder {
  var ignoreUnknownKeys: Boolean = false
  var isLenient: Boolean = false
  var encodeDefaults: Boolean = false
}

@Suppress("UNUSED_PARAMETER", "FunctionName")
fun Json(builderAction: JsonBuilder.() -> Unit): Json {
  JsonBuilder().builderAction()
  return Json
}

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

// PyreonDatabase-specific stub — Android Context exposing ONLY `filesDir`,
// the single member PyreonDatabase.kt touches (its Context convenience
// constructor resolves the app-private storage dir). Mirrored exactly rather
// than reusing the clipboard Context stub: that one lacks `filesDir`, and a
// stub that is a SUPERSET of the real surface is itself a masking source
// (the rule kotlin-stubs.ts documents).
const ANDROID_CONTENT_DATABASE_STUBS = `package android.content

import java.io.File

interface SharedPreferences {
  fun getString(key: String, defValue: String?): String?
  fun edit(): Editor
  interface Editor {
    fun putString(key: String, value: String?): Editor
    fun remove(key: String): Editor
    fun apply()
  }
}

open class Context {
  open val filesDir: File get() = File(System.getProperty("java.io.tmpdir"), "pyreon-stub-files")
  open val applicationContext: Context get() = this
  open fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
    throw UnsupportedOperationException("stub")
  companion object {
    const val MODE_PRIVATE: Int = 0
  }
}
`

// PyreonSecureStorageAndroid-only stub — the android.security.keystore
// surface KeystoreSecureBackend touches, mirrored EXACTLY (no superset).
// javax.crypto / java.security / java.util.Base64 are real JDK classes
// kotlinc resolves natively — only the android.* names need stubs.
const ANDROID_KEYSTORE_STUBS = `package android.security.keystore

import java.security.spec.AlgorithmParameterSpec

object KeyProperties {
  const val KEY_ALGORITHM_AES: String = "AES"
  const val PURPOSE_ENCRYPT: Int = 1
  const val PURPOSE_DECRYPT: Int = 2
  const val BLOCK_MODE_GCM: String = "GCM"
  const val ENCRYPTION_PADDING_NONE: String = "NoPadding"
}

class KeyGenParameterSpec private constructor() : AlgorithmParameterSpec {
  class Builder(keystoreAlias: String, purposes: Int) {
    fun setBlockModes(vararg blockModes: String): Builder = this
    fun setEncryptionPaddings(vararg paddings: String): Builder = this
    fun setKeySize(keySize: Int): Builder = this
    fun build(): KeyGenParameterSpec = throw UnsupportedOperationException("stub")
  }
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
// PyreonStorage-only stub — `LocalContext`, the CompositionLocal
// `rememberPyreonStorage` reads to install persistent storage by default.
// Mirrored exactly (a `current` that is @Composable), not a superset.
const ANDROIDX_COMPOSE_PLATFORM_STUBS = `package androidx.compose.ui.platform

import android.content.Context
import androidx.compose.runtime.Composable

object LocalContext {
  val current: Context @Composable get() = Context()
}
`

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

// PyreonLinking-specific stubs — the android.content.Context + Intent
// (ACTION_VIEW) + android.net.Uri surface PyreonLinking.kt uses, mirrored
// EXACTLY. Gated behind --service=PyreonLinking. Split into two files
// because a .kt file declares a single package (content + net).
const ANDROID_LINKING_CONTENT_STUBS = `package android.content

import android.net.Uri

open class Context {
  @Suppress("UNUSED_PARAMETER")
  open fun startActivity(intent: Intent) {}
}

class Intent {
  companion object {
    const val ACTION_VIEW = "android.intent.action.VIEW"
    const val FLAG_ACTIVITY_NEW_TASK = 0
  }
  @Suppress("UNUSED_PARAMETER")
  constructor(action: String, uri: Uri)
  @Suppress("UNUSED_PARAMETER")
  fun addFlags(flags: Int): Intent = this
}
`

/**
 * `android.content.Context` for the connectivity edge — exactly the members
 * PyreonNetworkStatusAndroid touches (applicationContext, getSystemService,
 * CONNECTIVITY_SERVICE). Separate from the location Context stub because each
 * mirrors only its own file's usage; a shared superset would mask a break.
 */
/**
 * `android.net` connectivity surface for PyreonNetworkStatusAndroid — exactly
 * the members that file touches. Named CONNECTIVITY, not NET: ANDROID_NET_STUBS
 * is already the linking service's `android.net.Uri` stub.
 */
const ANDROID_CONNECTIVITY_STUBS = `package android.net

public class Network

public class NetworkCapabilities {
  public fun hasCapability(capability: Int): Boolean = true
  public companion object {
    public const val NET_CAPABILITY_INTERNET: Int = 12
    public const val NET_CAPABILITY_VALIDATED: Int = 16
  }
}

public class NetworkRequest {
  public class Builder {
    public fun addCapability(capability: Int): Builder = this
    public fun build(): NetworkRequest = NetworkRequest()
  }
}

public open class ConnectivityManager {
  public open class NetworkCallback {
    public open fun onAvailable(network: Network) {}
    public open fun onLost(network: Network) {}
    public open fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {}
  }
  public val activeNetwork: Network? = null
  public fun getNetworkCapabilities(network: Network): NetworkCapabilities? = null
  public fun registerNetworkCallback(request: NetworkRequest, callback: NetworkCallback) {}
  // The API-26 Handler overload. Present because the REAL ConnectivityManager
  // has it and the runtime depends on it: without a Handler the callback is
  // delivered on a binder thread and its Compose state writes race the UI
  // thread's measure/layout. Omitting it would make the stub a SUBSET and
  // reject correct code — the mirror image of a superset masking a break.
  public fun registerNetworkCallback(
    request: NetworkRequest,
    callback: NetworkCallback,
    handler: android.os.Handler,
  ) {}
  public fun unregisterNetworkCallback(callback: NetworkCallback) {}
}
`

const ANDROID_NET_CONTEXT_STUBS = `package android.content

public open class Context {
  public val applicationContext: Context get() = this
  public fun getSystemService(name: String): Any? = null
  public companion object {
    public const val CONNECTIVITY_SERVICE: String = "connectivity"
  }
}
`

const ANDROID_NET_STUBS = `package android.net

class Uri {
  companion object {
    @Suppress("UNUSED_PARAMETER")
    fun parse(uriString: String): Uri = Uri()
  }
}
`

/**
 * androidx.media3 surface for PyreonVideoPlayerAndroid — exactly the members
 * that file touches, split by real package. Player carries the playback
 * surface (media3 puts setMediaItem/prepare/release/repeatMode/volume/
 * playWhenReady on Player, not ExoPlayer); ExoPlayer only adds its Builder.
 * Mirror-exact per the stub discipline: a superset masks, a subset
 * manufactures failures on correct code.
 */
const ANDROIDX_MEDIA3_COMMON_STUBS = `package androidx.media3.common

public class MediaItem {
  public companion object {
    @Suppress("UNUSED_PARAMETER")
    public fun fromUri(uri: String): MediaItem = MediaItem()
  }
}

public interface Player {
  public interface Listener {
    public fun onIsPlayingChanged(isPlaying: Boolean) {}
    public fun onPlaybackStateChanged(playbackState: Int) {}
  }
  public val playbackState: Int
  public var repeatMode: Int
  public var volume: Float
  public var playWhenReady: Boolean
  public fun setMediaItem(mediaItem: MediaItem)
  public fun prepare()
  public fun release()
  public fun addListener(listener: Listener)
  public fun removeListener(listener: Listener)
  public companion object {
    public const val REPEAT_MODE_OFF: Int = 0
    public const val REPEAT_MODE_ONE: Int = 1
    public const val STATE_BUFFERING: Int = 2
  }
}
`

const ANDROIDX_MEDIA3_EXOPLAYER_STUBS = `package androidx.media3.exoplayer

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player

public class ExoPlayer private constructor() : Player {
  override val playbackState: Int = 1
  override var repeatMode: Int = 0
  override var volume: Float = 1f
  override var playWhenReady: Boolean = false
  @Suppress("UNUSED_PARAMETER")
  override fun setMediaItem(mediaItem: MediaItem) {}
  override fun prepare() {}
  override fun release() {}
  @Suppress("UNUSED_PARAMETER")
  override fun addListener(listener: Player.Listener) {}
  @Suppress("UNUSED_PARAMETER")
  override fun removeListener(listener: Player.Listener) {}
  public class Builder(@Suppress("UNUSED_PARAMETER") context: Context) {
    public fun build(): ExoPlayer = ExoPlayer()
  }
}
`

const ANDROIDX_MEDIA3_UI_STUBS = `package androidx.media3.ui

import android.content.Context
import androidx.media3.common.Player

public class PlayerView(@Suppress("UNUSED_PARAMETER") context: Context) {
  public var player: Player? = null
  public var useController: Boolean = true
}
`

/** androidx.compose.ui surface for the video edge: the Modifier companion +
 *  the AndroidView interop composable (factory receives the view Context). */
const ANDROIDX_COMPOSE_UI_VIDEO_STUBS = `package androidx.compose.ui

public interface Modifier {
  public companion object : Modifier
}
`

const ANDROIDX_COMPOSE_VIEWINTEROP_STUBS = `package androidx.compose.ui.viewinterop

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
@Suppress("UNUSED_PARAMETER")
public fun <T> AndroidView(factory: (Context) -> T, modifier: Modifier = Modifier) {}
`

const ANDROID_VIDEO_CONTEXT_STUBS = `package android.content

public open class Context
`

/**
 * `android.content` surface for PyreonPushNotificationsAndroid — exactly the
 * members that file touches (BroadcastReceiver, the two registerReceiver
 * overloads + RECEIVER_NOT_EXPORTED, Intent extras, IntentFilter). Own copy of
 * Context per the per-service discipline: a shared superset would mask a
 * break. Signatures mirror the real SDK (nullable receiver/intent params,
 * `Intent?` returns) — a subset stub manufactures failures on correct code.
 */
const ANDROID_PUSH_CONTENT_STUBS = `package android.content

import android.os.Bundle

public abstract class BroadcastReceiver {
  public abstract fun onReceive(context: Context?, intent: Intent?)
}

public class Intent {
  public val extras: Bundle? = null
  @Suppress("UNUSED_PARAMETER")
  public fun getStringExtra(name: String): String? = null
}

public class IntentFilter(@Suppress("UNUSED_PARAMETER") action: String)

public open class Context {
  @Suppress("UNUSED_PARAMETER")
  public fun registerReceiver(receiver: BroadcastReceiver?, filter: IntentFilter): Intent? = null
  @Suppress("UNUSED_PARAMETER")
  public fun registerReceiver(receiver: BroadcastReceiver?, filter: IntentFilter, flags: Int): Intent? = null
  @Suppress("UNUSED_PARAMETER")
  public fun unregisterReceiver(receiver: BroadcastReceiver) {}
  public companion object {
    public const val RECEIVER_NOT_EXPORTED: Int = 4
  }
}
`

/**
 * `android.os` for the push edge — Build.VERSION.SDK_INT (the API-33
 * registerReceiver-flags gate) + the Bundle members the data-extras walk
 * reads. Separate from the connectivity Handler mirror: push does not touch
 * Handler, and per-service stubs mirror only their own file's usage.
 */
/**
 * androidx.lifecycle surface for PyreonAppStateAndroid — exactly the members
 * that file touches (Lifecycle.Event values it branches on, the observer
 * interface, the owner's lifecycle + add/removeObserver). The fun-interface
 * form mirrors the real LifecycleEventObserver so the lambda shape compiles.
 */
const ANDROIDX_LIFECYCLE_STUBS = `package androidx.lifecycle

public abstract class Lifecycle {
  public enum class Event { ON_CREATE, ON_START, ON_RESUME, ON_PAUSE, ON_STOP, ON_DESTROY, ON_ANY }
  public abstract fun addObserver(observer: LifecycleEventObserver)
  public abstract fun removeObserver(observer: LifecycleEventObserver)
}

public fun interface LifecycleEventObserver {
  public fun onStateChanged(source: LifecycleOwner, event: Lifecycle.Event)
}

public interface LifecycleOwner {
  public val lifecycle: Lifecycle
}
`

const ANDROID_APPSTATE_CONTEXT_STUBS = `package android.content

public open class Context
`

const ANDROID_PUSH_OS_STUBS = `package android.os

public class Build {
  public class VERSION {
    public companion object {
      public const val SDK_INT: Int = 33
    }
  }
}

public class Bundle {
  public fun keySet(): Set<String> = emptySet()
  @Suppress("UNUSED_PARAMETER")
  public fun getString(key: String): String? = null
}
`

// PyreonNotifications-specific stubs — the android.app + android.content +
// android.os + android.R + androidx.core.app surface PyreonNotifications.kt
// uses, mirrored EXACTLY. Split by package (a .kt file declares one
// package). Gated behind --service=PyreonNotifications.
const ANDROID_APP_NOTIF_STUBS = `package android.app

class Notification

class NotificationChannel(
  @Suppress("UNUSED_PARAMETER") id: String,
  @Suppress("UNUSED_PARAMETER") name: CharSequence,
  @Suppress("UNUSED_PARAMETER") importance: Int,
)

class NotificationManager {
  companion object {
    const val IMPORTANCE_DEFAULT = 3
  }
  @Suppress("UNUSED_PARAMETER")
  fun createNotificationChannel(channel: NotificationChannel) {}
}
`

const ANDROID_CONTENT_NOTIF_STUBS = `package android.content

open class Context {
  @Suppress("UNUSED_PARAMETER")
  open fun <T> getSystemService(serviceClass: Class<T>): T? = null
}
`

const ANDROID_OS_STUBS = `package android.os

object Build {
  object VERSION {
    const val SDK_INT = 34
  }
  object VERSION_CODES {
    const val O = 26
  }
}
`

const ANDROID_R_STUBS = `package android

object R {
  object drawable {
    const val ic_dialog_info = 0
  }
}
`

const ANDROIDX_CORE_APP_STUBS = `package androidx.core.app

import android.app.Notification
import android.content.Context

class NotificationCompat {
  class Builder(
    @Suppress("UNUSED_PARAMETER") context: Context,
    @Suppress("UNUSED_PARAMETER") channelId: String,
  ) {
    @Suppress("UNUSED_PARAMETER") fun setContentTitle(title: CharSequence): Builder = this
    @Suppress("UNUSED_PARAMETER") fun setContentText(text: CharSequence): Builder = this
    @Suppress("UNUSED_PARAMETER") fun setSmallIcon(icon: Int): Builder = this
    @Suppress("UNUSED_PARAMETER") fun setAutoCancel(autoCancel: Boolean): Builder = this
    fun build(): Notification = Notification()
  }
}

class NotificationManagerCompat {
  companion object {
    @Suppress("UNUSED_PARAMETER")
    fun from(context: Context): NotificationManagerCompat = NotificationManagerCompat()
  }
  @Suppress("UNUSED_PARAMETER")
  fun notify(id: Int, notification: Notification) {}
}
`

// PyreonWebSocketOkHttp-specific stubs — the okhttp3 4.x surface the
// transport file uses, mirrored EXACTLY (no superset — a superset stub
// masks; the same rule the compiler's kotlin-stubs.ts documents 4×).
// Gated behind --service=PyreonWebSocketOkHttp.
// android.os for the WEBSOCKET service — EXACTLY what PyreonWebSocketOkHttp.kt
// touches: a Handler built from the main Looper, used only to move OkHttp's
// reader-thread callbacks onto the thread that owns the Compose state.
// Deliberately separate from ANDROID_OS_STUBS (which mirrors Build.VERSION for
// PyreonNotifications): each service compiles alone against only its own stubs,
// so merging the two would hand every notification check a Handler it never
// uses — a superset, and supersets mask.
const ANDROID_OS_HANDLER_STUBS = `package android.os

public class Looper {
  public companion object {
    public fun getMainLooper(): Looper = Looper()
  }
}

public class Handler(looper: Looper) {
  @Suppress("UNUSED_PARAMETER")
  public fun post(r: Runnable): Boolean = true
}
`

// android.os for the CONNECTIVITY service — EXACTLY what
// PyreonNetworkStatusAndroid.kt touches: a main-looper Handler used for (a)
// the registerNetworkCallback delivery thread and (b) the reconciliation
// re-read loop (postDelayed / removeCallbacks). Separate from
// ANDROID_OS_HANDLER_STUBS (websocket — `post` only): per-service exact
// mirrors, because a shared superset masks (the 4x-documented rule).
const ANDROID_OS_CONNECTIVITY_HANDLER_STUBS = `package android.os

public class Looper {
  public companion object {
    public fun getMainLooper(): Looper = Looper()
  }
}

public class Handler(looper: Looper) {
  @Suppress("UNUSED_PARAMETER")
  public fun postDelayed(r: Runnable, delayMillis: Long): Boolean = true
  @Suppress("UNUSED_PARAMETER")
  public fun removeCallbacks(r: Runnable) {}
}
`

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

// PyreonHttpOkHttp-specific stubs — the okhttp3 4.x REQUEST/RESPONSE surface,
// mirrored EXACTLY. Deliberately SEPARATE from OKHTTP3_STUBS above (which
// mirrors the websocket surface): each service compiles alone against only its
// own stubs, and merging the two would hand the websocket check a
// `newCall`/`execute` it never uses, and this one a `newWebSocket` it never
// uses — supersets, and supersets mask.
//
// The shapes that matter and are easy to get wrong: `Request.Builder.method`
// takes `(String, RequestBody?)` — a NULLABLE body, which is the whole reason
// the executor branches per verb; `toRequestBody` and `toMediaTypeOrNull` are
// COMPANION extensions in 4.x (not top-level functions); `Response` is
// `Closeable` so `use { }` resolves; `Response.body` is NULLABLE and
// `string()` consumes the stream; and `Headers` is `Iterable<Pair<String,
// String>>`, which is what makes the destructuring loop compile.
const OKHTTP3_HTTP_STUBS = `package okhttp3

import java.io.Closeable

class MediaType {
  companion object {
    fun String.toMediaTypeOrNull(): MediaType? = null
  }
}

abstract class RequestBody {
  companion object {
    @Suppress("UNUSED_PARAMETER")
    fun String.toRequestBody(contentType: MediaType? = null): RequestBody =
      throw UnsupportedOperationException("stub")
  }
}

class Headers : Iterable<Pair<String, String>> {
  override fun iterator(): Iterator<Pair<String, String>> = emptyList<Pair<String, String>>().iterator()
}

class ResponseBody {
  fun string(): String = ""
}

class Response : Closeable {
  val code: Int = 0
  val headers: Headers = Headers()
  val body: ResponseBody? = null
  override fun close() {}
}

interface Call {
  fun execute(): Response
}

class Request private constructor() {
  class Builder {
    fun url(url: String): Builder = this
    fun addHeader(name: String, value: String): Builder = this
    @Suppress("UNUSED_PARAMETER")
    fun method(method: String, body: RequestBody?): Builder = this
    fun build(): Request = throw UnsupportedOperationException("stub")
  }
}

open class OkHttpClient {
  fun newCall(request: Request): Call = throw UnsupportedOperationException("stub")
}
`

// PyreonImagePicker-specific stubs — the androidx.activity ActivityResult
// surface the Android Photo Picker is driven through.
//
// STUB FIDELITY (the load-bearing rule — a stub that is a SUPERSET of the real
// library MASKS the exact bug it exists to catch): these mirror the REAL
// androidx.activity signatures. `ActivityResultLauncher<I>` is an abstract
// class (not an interface) whose `launch(input: I)` is the single-arg overload;
// `PickVisualMediaRequest` is BOTH a class and a same-named builder FUNCTION
// taking a `VisualMediaType`; `ImageOnly` is an object implementing that
// interface, nested under `ActivityResultContracts.PickVisualMedia`. Getting
// any of those shapes wrong here would let a mis-typed launch() call through.
const ANDROIDX_ACTIVITY_RESULT_STUBS = `package androidx.activity.result

import androidx.activity.result.contract.ActivityResultContracts

abstract class ActivityResultLauncher<I> {
  @Suppress("UNUSED_PARAMETER")
  fun launch(input: I) {}
}

class PickVisualMediaRequest

@Suppress("UNUSED_PARAMETER", "FunctionName")
fun PickVisualMediaRequest(
  mediaType: ActivityResultContracts.PickVisualMedia.VisualMediaType =
    ActivityResultContracts.PickVisualMedia.ImageAndVideo,
): PickVisualMediaRequest = PickVisualMediaRequest()
`

// Mirrors the REAL androidx.activity nesting: VisualMediaType is a SEALED
// interface and ImageOnly/VideoOnly/ImageAndVideo are objects nested DIRECTLY
// in PickVisualMedia (NOT in its companion — a companion-nested object would
// resolve as PickVisualMedia.Companion.ImageOnly and silently diverge from the
// real call site). kotlinc rejected the first draft of this stub for exactly
// that, which is the stub-fidelity rule earning its keep.
const ANDROIDX_ACTIVITY_CONTRACT_STUBS = `package androidx.activity.result.contract

class ActivityResultContracts {
  class PickVisualMedia {
    sealed interface VisualMediaType
    object ImageOnly : VisualMediaType
    object VideoOnly : VisualMediaType
    object ImageAndVideo : VisualMediaType
  }
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

// CompletableDeferred — PyreonImagePicker's callback-to-suspend bridge. Real
// shape: \`Deferred<T> : Job\` with \`suspend fun await(): T\`;
// \`CompletableDeferred<T> : Deferred<T>\` adds \`complete(value: T): Boolean\`
// (false when already completed); the same-named FUNCTION is the factory.
//
// Unlike the no-op \`launch\`/\`delay\` stubs above, this one is FUNCTIONAL:
// the picker's whole contract is "launch, suspend, resume when the
// ActivityResult callback fires", and a no-op await could not exercise it. It
// is built on kotlin-stdlib coroutine primitives only (suspendCoroutine), so it
// stays dependency-free like the rest of this harness.
interface Deferred<T> : Job {
  suspend fun await(): T
}

interface CompletableDeferred<T> : Deferred<T> {
  fun complete(value: T): Boolean
}

private val NOT_COMPLETED = Any()

private class CompletableDeferredImpl<T> : CompletableDeferred<T> {
  private var settled: Any? = NOT_COMPLETED
  private var waiter: kotlin.coroutines.Continuation<T>? = null

  override fun cancel() {}

  override fun complete(value: T): Boolean {
    if (settled !== NOT_COMPLETED) return false
    settled = value
    val pending = waiter
    waiter = null
    pending?.resumeWith(Result.success(value))
    return true
  }

  @Suppress("UNCHECKED_CAST")
  override suspend fun await(): T =
    kotlin.coroutines.suspendCoroutine { cont ->
      if (settled !== NOT_COMPLETED) cont.resumeWith(Result.success(settled as T))
      else waiter = cont
    }
}

@Suppress("UNUSED_PARAMETER", "FunctionName")
fun <T> CompletableDeferred(parent: Job? = null): CompletableDeferred<T> =
  CompletableDeferredImpl()
`

// PyreonGeolocationAndroid-only stubs — the android.location +
// android.os.Looper + Manifest/PackageManager/Context surface
// AndroidLocationSource touches, mirrored EXACTLY (per-service, minimal —
// a superset stub masks). The Context carries getSystemService +
// checkSelfPermission (the members the source calls); LOCATION_SERVICE is
// the companion constant the lookup keys on.
/**
 * Minimal `android.net` + Context surface for PyreonNetworkStatusAndroid.
 * Mirrors ONLY the members that file touches — a superset stub masks a real
 * break, a subset manufactures one, so this is deliberately exact.
 */
const ANDROID_LOCATION_STUBS = `package android.location

import android.os.Bundle
import android.os.Looper

open class Location(provider: String) {
  var latitude: Double = 0.0
  var longitude: Double = 0.0
  var accuracy: Float = 0f
  fun hasAccuracy(): Boolean = false
}

interface LocationListener {
  fun onLocationChanged(location: Location)
  fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
  fun onProviderDisabled(provider: String)
  fun onProviderEnabled(provider: String)
}

class LocationManager {
  fun isProviderEnabled(provider: String): Boolean = false
  fun requestLocationUpdates(
    provider: String,
    minTimeMs: Long,
    minDistanceM: Float,
    listener: LocationListener,
    looper: Looper?,
  ) {}
  fun removeUpdates(listener: LocationListener) {}
  companion object {
    const val GPS_PROVIDER: String = "gps"
    const val NETWORK_PROVIDER: String = "network"
  }
}
`

const ANDROID_LOCATION_SUPPORT_STUBS = `package android.os

class Bundle
class Looper private constructor() {
  companion object {
    private val main = Looper()
    fun getMainLooper(): Looper = main
  }
}
`

const ANDROID_LOCATION_CONTEXT_STUBS = `package android.content

open class Context {
  open val applicationContext: Context get() = this
  open fun getSystemService(name: String): Any? = null
  open fun checkSelfPermission(permission: String): Int = -1
  companion object {
    const val LOCATION_SERVICE: String = "location"
  }
}
`

const ANDROID_LOCATION_MANIFEST_STUBS = `package android

object Manifest {
  object permission {
    const val ACCESS_FINE_LOCATION: String = "android.permission.ACCESS_FINE_LOCATION"
    const val ACCESS_COARSE_LOCATION: String = "android.permission.ACCESS_COARSE_LOCATION"
  }
}
`

const ANDROID_LOCATION_PM_STUBS = `package android.content.pm

object PackageManager {
  const val PERMISSION_GRANTED: Int = 0
}
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
  const androidContentDatabasePath = join(tempDir, 'AndroidContentDatabase.kt')
  const composePlatformPath = join(tempDir, 'ComposeUiPlatform.kt')
  writeFileSync(kotlinxSerializationPath, KOTLINX_SERIALIZATION_STUBS, 'utf8')
  writeFileSync(kotlinxSerializationJsonPath, KOTLINX_SERIALIZATION_JSON_STUBS, 'utf8')
  if (
    SERVICE === 'PyreonDatabase' ||
    SERVICE === 'PyreonDatabaseAndroid' ||
    SERVICE === 'PyreonStorageAndroid' ||
    SERVICE === 'PyreonStorage' ||
    SERVICE === 'PyreonSecureStorageAndroid' ||
    SERVICE === 'PyreonCrashReporterAndroid'
  ) {
    writeFileSync(androidContentDatabasePath, ANDROID_CONTENT_DATABASE_STUBS, 'utf8')
  }
  // PyreonCrashReporterAndroid also needs the Compose LocalContext platform stub.
  if (SERVICE === 'PyreonCrashReporterAndroid') {
    writeFileSync(composePlatformPath, ANDROIDX_COMPOSE_PLATFORM_STUBS, 'utf8')
  }
  const androidKeystorePath = join(tempDir, 'AndroidKeystore.kt')
  if (SERVICE === 'PyreonSecureStorageAndroid') {
    writeFileSync(androidKeystorePath, ANDROID_KEYSTORE_STUBS, 'utf8')
  }
  if (SERVICE === 'PyreonStorage' || SERVICE === 'PyreonStorageAndroid') {
    writeFileSync(composePlatformPath, ANDROIDX_COMPOSE_PLATFORM_STUBS, 'utf8')
  }
  if (SERVICE === 'PyreonClipboard') {
    writeFileSync(androidContentPath, ANDROID_CONTENT_STUBS, 'utf8')
    writeFileSync(androidxCoreContentPath, ANDROIDX_CORE_CONTENT_STUBS, 'utf8')
    writeFileSync(kotlinxCoroutinesPath, KOTLINX_COROUTINES_STUBS, 'utf8')
  }
  // PyreonToast's auto-dismiss uses CoroutineScope.launch { delay(...) }.
  if (SERVICE === 'PyreonToast') {
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
  const pickerResultPath = join(tempDir, 'AndroidxActivityResult.kt')
  const pickerContractPath = join(tempDir, 'AndroidxActivityContract.kt')
  if (SERVICE === 'PyreonImagePicker') {
    writeFileSync(pickerResultPath, ANDROIDX_ACTIVITY_RESULT_STUBS, 'utf8')
    writeFileSync(pickerContractPath, ANDROIDX_ACTIVITY_CONTRACT_STUBS, 'utf8')
    writeFileSync(kotlinxCoroutinesPath, KOTLINX_COROUTINES_STUBS, 'utf8')
  }
  // PyreonFilePicker (M3.8) references ActivityResultLauncher<Array<String>> (the
  // generic launcher stub) + CompletableDeferred. Its runtime source doesn't
  // reference ActivityResultContracts (the OpenDocument contract lives in the
  // EMIT, not the runtime), but the result stub's PickVisualMediaRequest factory
  // default references ActivityResultContracts internally, so the contract stub
  // is included to keep the result stub self-consistent.
  if (SERVICE === 'PyreonFilePicker') {
    writeFileSync(pickerResultPath, ANDROIDX_ACTIVITY_RESULT_STUBS, 'utf8')
    writeFileSync(pickerContractPath, ANDROIDX_ACTIVITY_CONTRACT_STUBS, 'utf8')
    writeFileSync(kotlinxCoroutinesPath, KOTLINX_COROUTINES_STUBS, 'utf8')
  }
  const linkingContentPath = join(tempDir, 'AndroidContentLinking.kt')
  const linkingNetPath = join(tempDir, 'AndroidNet.kt')
  if (SERVICE === 'PyreonLinking') {
    writeFileSync(linkingContentPath, ANDROID_LINKING_CONTENT_STUBS, 'utf8')
    writeFileSync(linkingNetPath, ANDROID_NET_STUBS, 'utf8')
  }
  const notifAppPath = join(tempDir, 'AndroidApp.kt')
  const notifContentPath = join(tempDir, 'AndroidContentNotif.kt')
  const notifOsPath = join(tempDir, 'AndroidOs.kt')
  const notifRPath = join(tempDir, 'AndroidR.kt')
  const notifCorePath = join(tempDir, 'AndroidxCoreApp.kt')
  if (SERVICE === 'PyreonNotifications') {
    writeFileSync(notifAppPath, ANDROID_APP_NOTIF_STUBS, 'utf8')
    writeFileSync(notifContentPath, ANDROID_CONTENT_NOTIF_STUBS, 'utf8')
    writeFileSync(notifOsPath, ANDROID_OS_STUBS, 'utf8')
    writeFileSync(notifRPath, ANDROID_R_STUBS, 'utf8')
    writeFileSync(notifCorePath, ANDROIDX_CORE_APP_STUBS, 'utf8')
  }
  const okhttpPath = join(tempDir, 'OkHttp3.kt')
  if (SERVICE === 'PyreonWebSocketOkHttp') {
    writeFileSync(okhttpPath, OKHTTP3_STUBS, 'utf8')
    // The transport hops every listener callback to the main looper.
    writeFileSync(join(tempDir, 'AndroidOsHandler.kt'), ANDROID_OS_HANDLER_STUBS, 'utf8')
  }
  const okhttpHttpPath = join(tempDir, 'OkHttp3Http.kt')
  if (SERVICE === 'PyreonHttpOkHttp') {
    writeFileSync(okhttpHttpPath, OKHTTP3_HTTP_STUBS, 'utf8')
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
  // PyreonToast-only stub source: kotlinx.coroutines (auto-dismiss coroutine).
  const toastStubs = SERVICE === 'PyreonToast' ? [kotlinxCoroutinesPath] : []
  // PyreonHaptics-only stub source (the Compose hapticfeedback package).
  const hapticStubs = SERVICE === 'PyreonHaptics' ? [hapticFeedbackPath] : []
  const shareStubs = SERVICE === 'PyreonShare' ? [shareIntentPath] : []
  // PyreonImagePicker: the androidx.activity ActivityResult surface + the
  // coroutines stub (CompletableDeferred is its callback→suspend bridge).
  const pickerStubs =
    SERVICE === 'PyreonImagePicker'
      ? [pickerResultPath, pickerContractPath, kotlinxCoroutinesPath]
      : SERVICE === 'PyreonFilePicker'
        ? [pickerResultPath, pickerContractPath, kotlinxCoroutinesPath]
        : []
  // PyreonDatabase (Context stub for nothing yet) + PyreonDatabaseAndroid
  // (the Context factory), which additionally needs its sibling CORE source —
  // it references PyreonDatabase/FileDatabaseBackend, which live there. Same
  // shape as okhttpExtras.
  const databaseStubs =
    SERVICE === 'PyreonDatabase' ||
    SERVICE === 'PyreonDatabaseAndroid' ||
    SERVICE === 'PyreonStorageAndroid' ||
    SERVICE === 'PyreonStorage'
      ? [androidContentDatabasePath]
      : []
  // PyreonSecureStorageAndroid: the Context/SharedPreferences stub + the
  // android.security.keystore stub + the sibling CORE source (it references
  // PyreonSecureStorage/PyreonSecureBackend). javax.crypto / java.security /
  // java.util.Base64 are real JDK surface — no stubs needed.
  const secureAndroidExtras =
    SERVICE === 'PyreonSecureStorageAndroid'
      ? [
          androidContentDatabasePath,
          androidKeystorePath,
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonSecureStorage.kt'),
        ]
      : []
  const databaseCoreExtras =
    SERVICE === 'PyreonDatabaseAndroid'
      ? [resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonDatabase.kt')]
      : []
  // PyreonCrashReporter persists through the backend interface in
  // PyreonStorageBackends.kt and encodes via PyreonJson — both siblings come
  // along (the backend file is Compose-free by design; PyreonJson is the
  // hand-written codec the persistence assertions rely on being REAL).
  const crashReporterExtras =
    SERVICE === 'PyreonCrashReporter'
      ? [
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonStorageBackends.kt'),
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonJson.kt'),
        ]
      : []
  // PyreonStorageBackend + FileStorageBackend live in PyreonStorageBackends.kt so
  // they compile (and their persistence test RUNS) without Compose. Both the
  // Compose half and the Android factory reference them, so that sibling comes
  // along; the Android factory additionally needs the registry in
  // PyreonStorage.kt, its Compose stubs, and a Context.
  const storageFilePath = resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonStorageBackends.kt')
  const storageAndroidPath = resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonStorageAndroid.kt')
  const storageComposePath = resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonStorage.kt')
  const storageExtras =
    SERVICE === 'PyreonStorage'
      ? [composePlatformPath, storageFilePath, storageAndroidPath]
      : SERVICE === 'PyreonStorageAndroid'
        ? [composePlatformPath, storageFilePath, storageComposePath]
        : []
  // PyreonGeolocationAndroid: android.location + Looper/Bundle + a
  // location-shaped Context + Manifest/PackageManager stubs, the Compose
  // platform LocalContext, and the CORE sibling (the composable returns
  // PyreonGeolocation and calls installDefaultGeolocationSource).
  const locationPath = join(tempDir, 'AndroidLocation.kt')
  const locationSupportPath = join(tempDir, 'AndroidLocationSupport.kt')
  const locationContextPath = join(tempDir, 'AndroidLocationContext.kt')
  const locationManifestPath = join(tempDir, 'AndroidLocationManifest.kt')
  const locationPmPath = join(tempDir, 'AndroidLocationPm.kt')
  if (SERVICE === 'PyreonGeolocationAndroid') {
    writeFileSync(locationPath, ANDROID_LOCATION_STUBS, 'utf8')
    writeFileSync(locationSupportPath, ANDROID_LOCATION_SUPPORT_STUBS, 'utf8')
    writeFileSync(locationContextPath, ANDROID_LOCATION_CONTEXT_STUBS, 'utf8')
    writeFileSync(locationManifestPath, ANDROID_LOCATION_MANIFEST_STUBS, 'utf8')
    writeFileSync(locationPmPath, ANDROID_LOCATION_PM_STUBS, 'utf8')
    writeFileSync(composePlatformPath, ANDROIDX_COMPOSE_PLATFORM_STUBS, 'utf8')
  }
  const netPath = join(tempDir, 'AndroidNet.kt')
  const netContextPath = join(tempDir, 'AndroidNetContext.kt')
  if (SERVICE === 'PyreonNetworkStatusAndroid') {
    // Connectivity's OWN android.os mirror (postDelayed/removeCallbacks for
    // the reconciliation loop) — no longer the websocket's `post`-only one.
    writeFileSync(join(tempDir, 'AndroidOsHandler.kt'), ANDROID_OS_CONNECTIVITY_HANDLER_STUBS, 'utf8')
    writeFileSync(netPath, ANDROID_CONNECTIVITY_STUBS, 'utf8')
    writeFileSync(netContextPath, ANDROID_NET_CONTEXT_STUBS, 'utf8')
    writeFileSync(composePlatformPath, ANDROIDX_COMPOSE_PLATFORM_STUBS, 'utf8')
  }
  const networkAndroidExtras =
    SERVICE === 'PyreonNetworkStatusAndroid'
      ? [
          join(tempDir, 'AndroidOsHandler.kt'),
          netPath,
          netContextPath,
          composePlatformPath,
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonNetworkStatus.kt'),
        ]
      : []

  // PyreonPushNotificationsAndroid: its own android.content (BroadcastReceiver
  // / registerReceiver overloads / RECEIVER_NOT_EXPORTED) + android.os (Build
  // / Bundle) mirrors, the Compose platform LocalContext, and the CORE sibling
  // (the composable returns PyreonPushNotifications and drives its
  // notificationReceived transition).
  const pushContentPath = join(tempDir, 'AndroidPushContent.kt')
  const pushOsPath = join(tempDir, 'AndroidPushOs.kt')
  if (SERVICE === 'PyreonPushNotificationsAndroid') {
    writeFileSync(pushContentPath, ANDROID_PUSH_CONTENT_STUBS, 'utf8')
    writeFileSync(pushOsPath, ANDROID_PUSH_OS_STUBS, 'utf8')
    writeFileSync(composePlatformPath, ANDROIDX_COMPOSE_PLATFORM_STUBS, 'utf8')
  }
  const pushAndroidExtras =
    SERVICE === 'PyreonPushNotificationsAndroid'
      ? [
          pushContentPath,
          pushOsPath,
          composePlatformPath,
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonPushNotifications.kt'),
        ]
      : []

  // PyreonVideoPlayerAndroid: the androidx.media3 mirrors (common/exoplayer/ui)
  // + the compose-ui Modifier companion + the AndroidView interop composable +
  // a bare Context + the Compose platform LocalContext.
  const media3CommonPath = join(tempDir, 'Media3Common.kt')
  const media3ExoPath = join(tempDir, 'Media3Exo.kt')
  const media3UiPath = join(tempDir, 'Media3Ui.kt')
  const composeUiVideoPath = join(tempDir, 'ComposeUiVideo.kt')
  const composeInteropPath = join(tempDir, 'ComposeInterop.kt')
  const videoContextPath = join(tempDir, 'VideoContext.kt')
  if (SERVICE === 'PyreonVideoPlayerAndroid') {
    writeFileSync(media3CommonPath, ANDROIDX_MEDIA3_COMMON_STUBS, 'utf8')
    writeFileSync(media3ExoPath, ANDROIDX_MEDIA3_EXOPLAYER_STUBS, 'utf8')
    writeFileSync(media3UiPath, ANDROIDX_MEDIA3_UI_STUBS, 'utf8')
    writeFileSync(composeUiVideoPath, ANDROIDX_COMPOSE_UI_VIDEO_STUBS, 'utf8')
    writeFileSync(composeInteropPath, ANDROIDX_COMPOSE_VIEWINTEROP_STUBS, 'utf8')
    writeFileSync(videoContextPath, ANDROID_VIDEO_CONTEXT_STUBS, 'utf8')
    writeFileSync(composePlatformPath, ANDROIDX_COMPOSE_PLATFORM_STUBS, 'utf8')
  }
  const videoAndroidExtras =
    SERVICE === 'PyreonVideoPlayerAndroid'
      ? [
          media3CommonPath,
          media3ExoPath,
          media3UiPath,
          composeUiVideoPath,
          composeInteropPath,
          videoContextPath,
          composePlatformPath,
        ]
      : []

  // PyreonAppStateAndroid: the androidx.lifecycle mirror + a bare Context +
  // the Compose platform LocalContext + the CORE sibling (the composable
  // returns PyreonAppState and drives update()).
  const lifecyclePath = join(tempDir, 'AndroidxLifecycle.kt')
  const appStateContextPath = join(tempDir, 'AppStateContext.kt')
  if (SERVICE === 'PyreonAppStateAndroid') {
    writeFileSync(lifecyclePath, ANDROIDX_LIFECYCLE_STUBS, 'utf8')
    writeFileSync(appStateContextPath, ANDROID_APPSTATE_CONTEXT_STUBS, 'utf8')
    writeFileSync(composePlatformPath, ANDROIDX_COMPOSE_PLATFORM_STUBS, 'utf8')
  }
  const crashReporterAndroidExtras =
    SERVICE === 'PyreonCrashReporterAndroid'
      ? [
          androidContentDatabasePath,
          composePlatformPath,
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonCrashReporter.kt'),
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonStorageBackends.kt'),
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonJson.kt'),
        ]
      : []

  const appStateAndroidExtras =
    SERVICE === 'PyreonAppStateAndroid'
      ? [
          lifecyclePath,
          appStateContextPath,
          composePlatformPath,
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonAppState.kt'),
        ]
      : []

  const geolocationAndroidExtras =
    SERVICE === 'PyreonGeolocationAndroid'
      ? [
          locationPath,
          locationSupportPath,
          locationContextPath,
          locationManifestPath,
          locationPmPath,
          composePlatformPath,
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonGeolocation.kt'),
        ]
      : []
  const linkingStubs = SERVICE === 'PyreonLinking' ? [linkingContentPath, linkingNetPath] : []
  const notifStubs = SERVICE === 'PyreonNotifications' ? [notifAppPath, notifContentPath, notifOsPath, notifRPath, notifCorePath] : []
  // The OkHttp transport is an EXTENSION over the core container — its
  // compile needs the sibling PyreonWebSocket.kt source + the okhttp3 stubs.
  const okhttpExtras =
    SERVICE === 'PyreonWebSocketOkHttp'
      ? [
          okhttpPath,
          join(tempDir, 'AndroidOsHandler.kt'),
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonWebSocket.kt'),
        ]
      : []
  // Same shape as okhttpExtras: the executor is an EXTENSION over the core
  // PyreonHttp container, so its compile needs that sibling source too.
  const okhttpHttpExtras =
    SERVICE === 'PyreonHttpOkHttp'
      ? [
          okhttpHttpPath,
          resolve(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime/PyreonHttp.kt'),
        ]
      : []

  const kotlincArgs = typecheckOnly
    ? [
        '-d', tempDir,
        composeRuntimePath,
        kotlinxSerializationPath,
        kotlinxSerializationJsonPath,
        ...clipboardStubs,
        ...toastStubs,
        ...hapticStubs,
        ...shareStubs,
        ...pickerStubs,
        ...databaseStubs,
        ...databaseCoreExtras,
    ...crashReporterExtras,
        ...storageExtras,
        ...secureAndroidExtras,
        ...linkingStubs,
        ...notifStubs,
        ...okhttpExtras,
        ...okhttpHttpExtras,
        ...geolocationAndroidExtras,
        ...networkAndroidExtras,
        ...pushAndroidExtras,
        ...videoAndroidExtras,
        ...appStateAndroidExtras,
        ...crashReporterAndroidExtras,
        SOURCE_FILE,
      ]
    : [
        '-include-runtime',
        '-d', jarPath,
        composeRuntimePath,
        kotlinxSerializationPath,
        kotlinxSerializationJsonPath,
        ...clipboardStubs,
        ...toastStubs,
        ...hapticStubs,
        ...shareStubs,
        ...pickerStubs,
        ...databaseStubs,
        ...databaseCoreExtras,
    ...crashReporterExtras,
        ...storageExtras,
        ...secureAndroidExtras,
        ...linkingStubs,
        ...notifStubs,
        ...okhttpExtras,
        ...okhttpHttpExtras,
        ...geolocationAndroidExtras,
        ...networkAndroidExtras,
        ...pushAndroidExtras,
        ...videoAndroidExtras,
        ...appStateAndroidExtras,
        ...crashReporterAndroidExtras,
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
