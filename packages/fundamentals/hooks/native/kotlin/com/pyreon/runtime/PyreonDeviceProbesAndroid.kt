package com.pyreon.runtime

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.speech.tts.TextToSpeech
import android.view.WindowManager
import java.io.File
import java.util.UUID

/**
 * The Android platform halves of `useBluetooth`, `useAudioRecorder`,
 * `useSpeech`, `useDeviceMotion`, `useWakeLock` and `useDeviceInfo` —
 * `AndroidBluetoothScanner(ctx)`, `AndroidRecordingEngine(ctx)`,
 * `AndroidSpeechSynth(ctx)`, `AndroidMotionSource(ctx)`,
 * `AndroidScreenKeeper(ctx)` and `AndroidDeviceProbe(ctx)`, named by the
 * Compose emit.
 *
 * Own file for the usual gate reason: the hook state machines
 * (`PyreonBluetooth.kt` …) stay `android.*`-free so they remain verifiable
 * under the Compose-only kotlinc stubs and runnable in plain JVM.
 *
 * ## Why these exist
 *
 * The emit named all six but they existed only in `kotlin-stubs.ts`, so every
 * app using one of the hooks failed `gradle assembleDebug` with
 * `Unresolved reference` while every stub-based gate stayed green.
 *
 * ## Permissions
 *
 * The interfaces are synchronous (`begin(): Boolean`), and an Android runtime
 * permission prompt is not. So the engines that need a dangerous permission
 * (microphone, BLE scan) check it at call time; when it is missing they ASK
 * the hosting Activity for it and report the ordinary "denied" outcome
 * (`false` / an `error` message) for THIS call. The next call, after the user
 * has answered the prompt, succeeds. That is the documented Android norm for a
 * fire-and-check API and matches how the web arm surfaces a denial — an
 * ordinary branch, never a throw. The app must still DECLARE the permission in
 * its manifest (`RECORD_AUDIO`; `BLUETOOTH_SCAN` on API 31+, or
 * `ACCESS_FINE_LOCATION` plus `BLUETOOTH`/`BLUETOOTH_ADMIN` up to API 30), and
 * declare a `<queries>` entry for `android.intent.action.TTS_SERVICE` so
 * package visibility (API 30+) lets speech find an engine.
 *
 * Sensors, speech and the scan callback are registered against
 * `applicationContext`; the Activity is kept only where a Window or a
 * permission prompt is the point (screen keeper, recorder, scanner). Each hook
 * state class releases its engine when it leaves composition (it is a
 * `RememberObserver`), so nothing outlives the screen that asked for it.
 */

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

private fun Context.granted(permission: String): Boolean =
    checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

/**
 * Ask the hosting Activity for [permissions] and report whether ALL are
 * already granted. A Context with no Activity cannot show a prompt, so it just
 * reports the state.
 */
private fun Context.ensure(permissions: List<String>): Boolean {
    val missing = permissions.filterNot { granted(it) }
    if (missing.isEmpty()) return true
    findActivity()?.requestPermissions(missing.toTypedArray(), PERMISSION_REQUEST_CODE)
    return false
}

private const val PERMISSION_REQUEST_CODE = 0x5079

// ── Device info ──────────────────────────────────────────────────────────

/**
 * `Build.MODEL`, `Build.VERSION.RELEASE`, the touchscreen feature flag and the
 * display size in dp (the web's CSS px) with the density as `scale`. Read
 * through on every access so a rotation or fold is reflected.
 */
public class AndroidDeviceProbe(private val context: Context) : DeviceProbe {
    override val model: String get() = Build.MODEL ?: ""
    override val osVersion: String get() = Build.VERSION.RELEASE ?: ""

    override val isTouch: Boolean
        get() = context.packageManager.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN)

    override val screen: PyreonDeviceScreen
        get() {
            val m = context.resources.displayMetrics
            val density = if (m.density > 0f) m.density.toDouble() else 1.0
            return PyreonDeviceScreen(m.widthPixels / density, m.heightPixels / density, density)
        }
}

// ── Wake lock ────────────────────────────────────────────────────────────

/**
 * `FLAG_KEEP_SCREEN_ON` on the hosting Activity's window. Like
 * `isIdleTimerDisabled` on iOS it survives backgrounding (the window keeps the
 * flag and the OS honours it whenever the Activity is visible again), which is
 * the behaviour the web arm re-acquires on `visibilitychange` to reach.
 *
 * A Context with no Activity has no window to hold, so it is unsupported.
 */
public class AndroidScreenKeeper(context: Context) : ScreenKeeper {
    private val activity: Activity? = context.findActivity()

    override val isSupported: Boolean get() = activity != null

    override fun setKeepScreenOn(on: Boolean) {
        val a = activity ?: return
        // Window flags are UI-thread only; callers are usually event handlers
        // already on it, but nothing in the interface promises that.
        a.runOnUiThread {
            if (on) {
                a.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                a.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }
}

// ── Device motion ────────────────────────────────────────────────────────

/**
 * Accelerometer (m/s², INCLUDING gravity — resting face-up reads z ≈ +9.81,
 * the W3C `accelerationIncludingGravity` convention the web arm forwards) and
 * gyroscope (converted from rad/s to deg/s, x/y/z = the rate about the
 * device's x/y/z axes, matching `rotationRate` beta/gamma/alpha) paired into
 * the one `(acceleration, rotation)` sample the state machine takes.
 *
 * Both sensors run at UI rate and a sample is delivered on every accelerometer
 * event, carrying the latest gyro reading. A device with no gyroscope reports
 * zero rotation rather than being unsupported: tilt (the common use) needs
 * only the accelerometer.
 */
public class AndroidMotionSource(context: Context) : MotionSource {
    private val manager: SensorManager? =
        context.applicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val accelerometer: Sensor? = manager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope: Sensor? = manager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private var listener: SensorEventListener? = null

    override val isAvailable: Boolean get() = accelerometer != null

    override fun begin(onSample: (PyreonVec3, PyreonVec3) -> Unit): Boolean {
        val m = manager ?: return false
        val accel = accelerometer ?: return false
        end() // never leave a previous listener registered
        var rotation = PyreonVec3.zero
        val l = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                when (event.sensor.type) {
                    Sensor.TYPE_GYROSCOPE -> rotation = PyreonVec3(
                        Math.toDegrees(event.values[0].toDouble()),
                        Math.toDegrees(event.values[1].toDouble()),
                        Math.toDegrees(event.values[2].toDouble()),
                    )
                    Sensor.TYPE_ACCELEROMETER -> onSample(
                        PyreonVec3(
                            event.values[0].toDouble(),
                            event.values[1].toDouble(),
                            event.values[2].toDouble(),
                        ),
                        rotation,
                    )
                }
            }

            override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {}
        }
        val ok = m.registerListener(l, accel, SensorManager.SENSOR_DELAY_UI)
        if (!ok) return false
        gyroscope?.let { m.registerListener(l, it, SensorManager.SENSOR_DELAY_UI) }
        listener = l
        return true
    }

    override fun end() {
        val l = listener ?: return
        manager?.unregisterListener(l)
        listener = null
    }
}

// ── Audio recording ──────────────────────────────────────────────────────

/**
 * `MediaRecorder` capturing AAC in an MPEG-4 container into the app's cache
 * directory; [end] returns the `file://` URI of the finished recording (the
 * one representation all three targets produce). Needs `RECORD_AUDIO`.
 */
public class AndroidRecordingEngine(private val context: Context) : RecordingEngine {
    private var recorder: MediaRecorder? = null
    private var file: File? = null

    override val isAvailable: Boolean
        get() = context.packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)

    override fun begin(): Boolean {
        if (!context.ensure(listOf(Manifest.permission.RECORD_AUDIO))) return false
        release()
        val out = File(context.applicationContext.cacheDir, "pyreon-rec-${UUID.randomUUID()}.m4a")
        @Suppress("DEPRECATION")
        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context.applicationContext)
        } else {
            MediaRecorder()
        }
        return try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setOutputFile(out.absolutePath)
            r.prepare()
            r.start()
            recorder = r
            file = out
            true
        } catch (_: Exception) {
            // Mic busy / no input device: an ordinary "could not start".
            runCatching { r.release() }
            out.delete()
            false
        }
    }

    override fun end(): String? {
        val r = recorder ?: return null
        val out = file
        recorder = null
        file = null
        val ok = try {
            r.stop()
            true
        } catch (_: RuntimeException) {
            // `stop()` throws when nothing was captured (stopped immediately).
            false
        } finally {
            runCatching { r.release() }
        }
        if (!ok || out == null || !out.exists() || out.length() == 0L) {
            out?.delete()
            return null
        }
        return Uri.fromFile(out).toString()
    }

    /** Releasing the recorder is what turns the OS mic indicator off. */
    override fun release() {
        recorder?.let { runCatching { it.stop() }; runCatching { it.release() } }
        recorder = null
        file?.delete()
        file = null
    }
}

// ── Speech ───────────────────────────────────────────────────────────────

/**
 * Platform [TextToSpeech]. The engine initialises asynchronously, so a `speak`
 * issued before it is ready is held and spoken the moment it is (only the
 * latest — a queue of stale utterances is never what a caller means). If no
 * engine exists (init reports an error) the synth reports unavailable.
 * Needs a `<queries>` entry for `android.intent.action.TTS_SERVICE` on API 30+.
 */
public class AndroidSpeechSynth(context: Context) : SpeechSynth, AutoCloseable {
    private var ready = false
    private var failed = false
    private var pending: String? = null
    private var tts: TextToSpeech? = null

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                ready = true
                pending?.let { say(it) }
                pending = null
            } else {
                failed = true
                pending = null
            }
        }
    }

    override val isAvailable: Boolean get() = !failed

    override fun speak(text: String) {
        if (ready) say(text) else pending = text
    }

    private fun say(text: String) {
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pyreon-${UUID.randomUUID()}")
    }

    override fun cancel() {
        pending = null
        tts?.stop()
    }

    /** Frees the engine binding. [PyreonSpeech] calls it when it leaves composition. */
    override fun close() {
        pending = null
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready = false
    }
}

// ── Bluetooth ────────────────────────────────────────────────────────────

/**
 * BLE discovery through the platform scanner. Discovery only, like every
 * target of `useBluetooth`. `id` is the device address, `name` the advertised
 * local name (`''` when none — read from the scan record, which needs no
 * `BLUETOOTH_CONNECT`). Permissions: `BLUETOOTH_SCAN` on API 31+, otherwise
 * `ACCESS_FINE_LOCATION`.
 */
public class AndroidBluetoothScanner(context: Context) : BluetoothScanner {
    private val appContext: Context = context.applicationContext
    // Kept only to find the Activity for a permission prompt. Its lifetime is
    // the composition's (the hook is `remember`ed), and `stopScan` runs when
    // the hook leaves it, so a rotation cannot pin the Activity past that.
    private val host: Context = context
    private val adapter = (appContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    private var callback: ScanCallback? = null

    override val isAvailable: Boolean
        get() = adapter != null && appContext.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)

    private val permissions: List<String>
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(Manifest.permission.BLUETOOTH_SCAN)
        } else {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    override fun startScan(onDevice: (PyreonBluetoothDevice) -> Unit, onError: (String) -> Unit) {
        val a = adapter
        if (a == null) {
            onError("Bluetooth is not available on this platform")
            return
        }
        if (!host.ensure(permissions)) {
            onError("Bluetooth permission was denied — grant it and scan again")
            return
        }
        if (!a.isEnabled) {
            onError("Bluetooth is turned off")
            return
        }
        val scanner = a.bluetoothLeScanner
        if (scanner == null) {
            onError("Bluetooth is turned off")
            return
        }
        stopScan()
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                onDevice(
                    PyreonBluetoothDevice(
                        id = result.device.address,
                        name = result.scanRecord?.deviceName ?: "",
                    ),
                )
            }

            override fun onScanFailed(errorCode: Int) {
                callback = null
                onError("Bluetooth scan failed (code $errorCode)")
            }
        }
        try {
            scanner.startScan(cb)
            callback = cb
        } catch (e: SecurityException) {
            onError("Bluetooth permission was denied — grant it and scan again")
        }
    }

    override fun stopScan() {
        val cb = callback ?: return
        callback = null
        try {
            adapter?.bluetoothLeScanner?.stopScan(cb)
        } catch (_: SecurityException) {
            // Permission revoked mid-scan: nothing left to stop.
        }
    }
}
