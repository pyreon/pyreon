/**
 * `@pyreon/hooks`' native lowering, owned by the library.
 *
 * Each entry says how one platform-service hook crosses to SwiftUI and Compose:
 * the runtime container it holds for the component's lifetime (Swift
 * initialiser, Kotlin declaration lines) and the small data vocabulary for its
 * satellite behaviour (`accessorReads`, `callRead`, `kotlinState`, `lifecycle`,
 * `destructure`, `optionalFields`). The vocabulary is defined by
 * `ServiceDescriptor` in `@pyreon/native-compiler` (`src/services.ts`); the
 * types below are imported as TYPES only, so this package gains no runtime
 * dependency on the compiler.
 *
 * This file is the SOURCE OF TRUTH. `@pyreon/native-compiler` keeps a
 * generated copy (`src/built-in-services.generated.ts`, written by
 * `scripts/gen-native-builtin-plugins.ts`) so a zero-config `transform()` needs
 * no library installed; an app whose `@pyreon/hooks` is newer than the compiler
 * has this plugin discovered from `pyreon.native.plugin` and it REPLACES the
 * built-in of the same name. The declaration ORDER is meaningful (the Swift
 * lifecycle modifiers emit in registry order) — do not sort it.
 *
 * `legacyKind` keeps each hook's synthesized struct names identical to the
 * output from before the hooks were descriptors (`moduleTag` hashes a service
 * declaration as `{ kind: legacyKind, name }`); droppable when the golden is
 * deliberately re-baselined.
 *
 * Every Swift/Kotlin type named here must be declared in `native/swift` /
 * `native/kotlin` (or the shared runtimes); `scripts/check-native-plugin-types.ts`
 * fails otherwise.
 */
import type { CompilerPlugin } from '@pyreon/native-compiler'

const num = { kind: 'number' as const }
const str = { kind: 'string' as const }
/** `Error?` on Swift, `Throwable?` on Kotlin — an error OBJECT, never a string. */
const ERROR_OBJECT = { kind: 'typeRef' as const, name: 'Error', args: [] }

const nativePlugin = {
  name: '@pyreon/hooks',
  apiVersion: 1,
  modules: ['@pyreon/hooks'],
  services: {
    // M3.2 — share sheet. iOS presents a UIActivityViewController from the key
    // window itself; Android needs a Context (hoisted from LocalContext because
    // a composition-local cannot be read inside `remember { }`).
    useShare: {
      legacyKind: 'share',
      swift: 'PyreonShare()',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonShare({id}Ctx) }',
      ],
    },
    // M3.2b — external-URL open. iOS uses the shared application; Android needs a
    // Context for `startActivity`.
    useLinking: {
      legacyKind: 'linking',
      swift: 'PyreonLinking()',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonLinking({id}Ctx) }',
      ],
    },
    // M3.1 — haptics. Fire-and-forget. Compose's `LocalHapticFeedback` is a
    // composition-local (no permission, no Context), hoisted to a sibling val for
    // the same reason as the Context above.
    useHaptics: {
      legacyKind: 'haptics',
      swift: 'PyreonHaptics()',
      kotlin: [
        'val {id}Haptic = LocalHapticFeedback.current',
        'val {id} = remember { PyreonHaptics({id}Haptic) }',
      ],
    },
    // M3.3 — local notifications (iOS UNUserNotificationCenter; Android
    // NotificationManager, which needs a Context).
    useNotifications: {
      legacyKind: 'notifications',
      swift: 'PyreonNotifications()',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonNotifications({id}Ctx) }',
      ],
    },
    // M3.5 — biometric gate. `authenticate(reason)` is async/suspend, awaited in
    // an `async` handler. The v1 Kotlin runtime needs no Context.
    useBiometrics: {
      legacyKind: 'biometrics',
      swift: 'PyreonBiometrics()',
      kotlin: ['val {id} = remember { PyreonBiometrics() }'],
    },
    // M3.4 — photo picker. `pick()` is async. Android delivers the asset through
    // an ActivityResult callback whose launcher MUST be registered at composition
    // time (`rememberLauncherForActivityResult` is @Composable, so it cannot live
    // inside `remember { }`); the container exposes a settable `launcher` and
    // bridges callback → suspend so `pick()` keeps the Swift `async` shape. The
    // assignment re-runs on recomposition, re-assigning the SAME instance.
    useImagePicker: {
      legacyKind: 'image-picker',
      swift: 'PyreonImagePicker()',
      kotlin: [
        'val {id} = remember { PyreonImagePicker() }',
        '{id}.launcher = rememberLauncherForActivityResult(',
        '    ActivityResultContracts.PickVisualMedia()',
        '  ) { uri -> {id}.onResult(uri?.toString()) }',
      ],
    },
    // M3.8 — document picker over the SAF `OpenDocument` contract; same
    // composition-time registration rule as the image picker.
    useFilePicker: {
      legacyKind: 'file-picker',
      swift: 'PyreonFilePicker()',
      kotlin: [
        'val {id} = remember { PyreonFilePicker() }',
        '{id}.launcher = rememberLauncherForActivityResult(',
        '    ActivityResultContracts.OpenDocument()',
        '  ) { uri -> {id}.onResult(uri?.toString()) }',
      ],
    },
    // Camera capture. UIImagePickerController presents from the key window, so
    // iOS only needs the presenter; Android assigns the launcher from the
    // composition (TakePicturePreview hands back a bitmap the runtime persists,
    // so the callback feeds a URI).
    useCamera: {
      legacyKind: 'camera',
      swift: 'PyreonCamera(presenter: UIKitCameraPresenter())',
      kotlin: [
        'val {id} = remember { PyreonCamera() }',
        '{id}.launch = rememberCameraLauncher { uri -> {id}.onResult(uri) }',
      ],
    },
    // ── Containers with satellite behaviour (see the vocabulary above) ─────────

    // Clipboard. Reads are method calls (`cb.copy("hi")`) + two members the web
    // reads as accessors (`copied`, `text`) — plain properties natively.
    // Compose's clipboard needs a Context AND a composition-bound coroutine
    // scope: `rememberCoroutineScope()` cancels the 2s `copied` reset when the
    // composable leaves composition (a bare self-owned `Dispatchers.IO` scope
    // leaked under repeated remount). Local reads cannot live inside
    // `remember { }`, so both are hoisted to sibling vals.
    useClipboard: {
      legacyKind: 'clipboard',
      swift: 'PyreonClipboard()',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id}Scope = rememberCoroutineScope()',
        'val {id} = remember { PyreonClipboard({id}Ctx, {id}Scope) }',
      ],
      accessorReads: ['copied', 'text'],
      destructure: true,
    },
    // Discovery-only BLE; GATT stays platform-specific. The scanner is injected
    // so the runtime's logic stays testable without a radio.
    useBluetooth: {
      legacyKind: 'bluetooth',
      swift: 'PyreonBluetooth(scanner: CoreBluetoothScanner())',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonBluetooth(AndroidBluetoothScanner({id}Ctx)) }',
      ],
      accessorReads: ['scanning', 'devices', 'error', 'available'],
      kotlinState: ['scanning', 'devices', 'error'],
    },
    // Idle-timer / keep-screen-on. The controller is injected so the
    // held/released machine is testable without UIKit.
    useWakeLock: {
      legacyKind: 'wake-lock',
      swift: 'PyreonWakeLock(controller: UIKitIdleTimer())',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonWakeLock(AndroidScreenKeeper({id}Ctx)) }',
      ],
      accessorReads: ['active', 'supported'],
      kotlinState: ['active'],
    },
    // Device description. `platform` is a compile-time constant per target; every
    // read is a plain getter on both (no `.value` on Kotlin).
    useDeviceInfo: {
      legacyKind: 'device-info',
      swift: 'PyreonDeviceInfo(probe: UIKitDeviceProbe())',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonDeviceInfo(AndroidDeviceProbe({id}Ctx)) }',
      ],
      accessorReads: ['platform', 'model', 'osVersion', 'isTouch', 'screen'],
    },
    // ONE accessor rather than four (the values move together on rotation, and
    // separate accessors invite a torn pair): `s().top` on the web becomes
    // `s.insets.top`.
    useSafeArea: {
      legacyKind: 'safe-area',
      swift: 'PyreonSafeArea(probe: UIKitSafeAreaProbe())',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonSafeArea(AndroidSafeAreaProbe({id}Ctx)) }',
      ],
      callRead: 'insets',
    },
    // Read-only: locking does not cross (Chromium-only + fullscreen on the web;
    // an app-level declaration on iOS).
    useScreenOrientation: {
      legacyKind: 'screen-orientation',
      swift: 'PyreonScreenOrientation(probe: UIKitOrientationProbe())',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonScreenOrientation(AndroidOrientationProbe({id}Ctx)) }',
      ],
      accessorReads: ['type', 'angle'],
    },
    // Explicit start/stop (an always-on sensor drains battery for a screen nobody
    // is looking at), so NOT a `lifecycle` service. `supported` is a plain getter.
    useDeviceMotion: {
      legacyKind: 'device-motion',
      swift: 'PyreonDeviceMotion(source: CoreMotionSource())',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonDeviceMotion(AndroidMotionSource({id}Ctx)) }',
      ],
      accessorReads: ['active', 'supported', 'acceleration', 'rotation'],
      kotlinState: ['active', 'acceleration', 'rotation'],
    },
    // Rate/pitch/voice are out of scope: the platforms disagree on ranges and
    // voice identity, so one name would mean three different things.
    useSpeech: {
      legacyKind: 'speech',
      swift: 'PyreonSpeech(synth: AVSpeechSynth())',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonSpeech(AndroidSpeechSynth({id}Ctx)) }',
      ],
      accessorReads: ['speaking', 'supported'],
      kotlinState: ['speaking'],
    },
    // `start()` returns a Bool rather than throwing (a denied mic permission is
    // an ordinary branch); recording begins on a user action, so no lifecycle.
    useAudioRecorder: {
      legacyKind: 'audio-recorder',
      swift: 'PyreonAudioRecorder(engine: AVFoundationRecordingEngine())',
      kotlin: [
        'val {id}Ctx = LocalContext.current',
        'val {id} = remember { PyreonAudioRecorder(AndroidRecordingEngine({id}Ctx)) }',
      ],
      accessorReads: ['recording', 'error', 'supported'],
      kotlinState: ['recording', 'error'],
    },
    // NOTE: the order of the `lifecycle` entries below (useOnline, usePush,
    // useAppState, useCrashReporter) is the order their Swift modifiers emit in.

    // Connectivity. The runtime shipped a real NWPathMonitor behind `start()` and
    // nothing called it, so `useOnline()` was frozen at `true` (the never-wired
    // class). Android's `rememberPyreonNetworkStatus()` self-installs a
    // ConnectivityManager callback and tears it down on leave.
    useOnline: {
      legacyKind: 'network-status',
      swift: 'PyreonNetworkStatus()',
      kotlin: ['val {id} = rememberPyreonNetworkStatus()'],
      callRead: 'isOnline',
      kotlinState: ['isOnline'],
      lifecycle: 'start-stop',
      destructure: true,
    },
    // Push. Android's factory self-installs the PYREON_PUSH_ACTION receiver; the
    // no-arg Swift `start()` installs a container-owned UNUserNotificationCenter
    // delegate. The credentialed token half stays app-wired.
    usePush: {
      legacyKind: 'push',
      swift: 'PyreonPushNotifications()',
      kotlin: ['val {id} = rememberPyreonPushNotifications()'],
      kotlinState: ['token', 'lastNotification', 'notifications', 'isAuthorized', 'error'],
      lifecycle: 'start-stop',
      destructure: true,
      optionalFields: { error: ERROR_OBJECT },
    },
    // App lifecycle phase (`active` | `inactive` | `background`); `state()` reads
    // `.phase`. `wasBackgrounded` is the sticky flag the lifecycle device test reads.
    useAppState: {
      legacyKind: 'app-state',
      swift: 'PyreonAppState()',
      kotlin: ['val {id} = rememberPyreonAppState()'],
      callRead: 'phase',
      kotlinState: ['phase', 'wasBackgrounded'],
      lifecycle: 'start-stop',
      destructure: true,
    },
    // Crash reporting. `start()` installs the uncaught-exception hook and
    // rehydrates the previous launch's report; a report that vanishes on
    // relaunch is worse than none, so Android's factory installs a file-backed
    // backend. Appear-only: there is nothing to stop.
    useCrashReporter: {
      legacyKind: 'crash-reporter',
      swift: 'PyreonCrashReporter()',
      kotlin: ['val {id} = rememberPyreonCrashReporter()'],
      kotlinState: ['lastCrash', 'hadCrash'],
      lifecycle: 'start',
      destructure: true,
    },
    // Location. Permission-gated, so `start()` stays an explicit user action (not
    // a `lifecycle`); Android's factory installs the platform LocationManager
    // source (an app-chosen registry source wins).
    useGeolocation: {
      legacyKind: 'geolocation',
      swift: 'PyreonGeolocation()',
      kotlin: ['val {id} = rememberPyreonGeolocation()'],
      kotlinState: ['latitude', 'longitude', 'accuracy', 'isAuthorized', 'error'],
      destructure: true,
      optionalFields: { latitude: num, longitude: num, accuracy: num, error: ERROR_OBJECT },
    },
    // In-app purchase. A purchase flow is user-triggered, so no lifecycle.
    usePayments: {
      legacyKind: 'payments',
      swift: 'PyreonPayments()',
      kotlin: ['val {id} = remember { PyreonPayments() }'],
      kotlinState: ['products', 'ownedProductIds', 'purchasing', 'error'],
      destructure: true,
      optionalFields: { purchasing: str, error: ERROR_OBJECT },
    },
  },
} satisfies CompilerPlugin

export default nativePlugin
