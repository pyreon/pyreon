/**
 * Service descriptors — plain "service container" hooks as DATA.
 *
 * A *plain* service is a hook whose whole lowering is "hold one runtime
 * container for the component's lifetime": `const share = useShare()` becomes
 * an `@State` `PyreonShare()` on iOS and a remembered `PyreonShare(ctx)` on
 * Android, and every later call (`share.text("hi")`) flows through UNCHANGED —
 * no `.value` rewrite, no argument transformation, no reactive field, no
 * lifecycle. Before this module each such hook was a recognizer branch in
 * `parse.ts`, a `DeclIR` union member, and one emit branch per target, all
 * restating the same shape. Now a plain service is ONE entry in `SERVICES`;
 * the parser lowers it to the generic `{ kind: 'service', hook }` declaration
 * and both emitters render it from the descriptor.
 *
 * Satellite behaviour has a small DATA vocabulary on the same descriptor, so a
 * service that is more than a bare container is still one entry:
 *
 *   - `accessorReads` — members the web reads as accessors (`clip.copied()`)
 *     but the native container stores as properties; the call's parens drop on
 *     both targets.
 *   - `callRead` — the property a BARE call of the container reads
 *     (`net()` → `net.isOnline`).
 *   - `kotlinState` — members that are Compose `MutableState` on Kotlin, so a
 *     read appends `.value` (Swift's @Observable needs no rewrite).
 *   - `lifecycle` — a reactive monitor whose `start()` MUST be called, or the
 *     hook renders its initial value forever (the never-wired class). Swift
 *     attaches `.onAppear`/`.onDisappear`; Kotlin's `rememberPyreonX()`
 *     factory self-installs, which is why the descriptor's Kotlin line names it.
 *   - `destructure` — `const { copy } = useX()` aliases onto the container.
 *   - `optionalFields` — members the runtimes declare optional, for typing.
 *
 * Deliberately NOT here (they stay hand-written): `useDatabase` (its `insert`
 * and Swift argument-label rewrites are call LOGIC, not data), `useWebSocket`
 * (constructor argument taken from the call + auto-connect synthesis), and
 * services with a struct-typed generic (`useAuth<T>`, `useFetch<T>`,
 * `useStream<T>`).
 */

import type { TypeIR } from './types'

/**
 * A service container's `error` is an error OBJECT on both runtimes (`Error?`
 * on Swift, `Throwable?` on Kotlin) and on the web — never a string, so the
 * nil test is the faithful lowering of a JS truthiness check on it.
 */
export const ERROR_OBJECT: TypeIR = { kind: 'typeRef', name: 'Error', args: [] }

export interface ServiceDescriptor {
  /** The hook the author calls, e.g. `useShare`. */
  readonly hook: string
  /**
   * The decl kind this hook lowered to BEFORE it was a descriptor. A module's
   * synthesized-struct suffix (`__Obj0_ab12cd`) hashes the parsed IR
   * (`moduleTag`), so moving a hook onto the generic `service` declaration
   * would rename every anonymous struct in every file that uses it — output
   * that is otherwise byte-identical. `moduleTag` hashes a service decl as
   * `{ kind: legacyKind, name }` so the names hold. Droppable the next time
   * the golden is deliberately re-baselined.
   */
  readonly legacyKind: string
  /**
   * Swift initialiser expression, placed after `@State private var <id> = `.
   * Emitted verbatim.
   */
  readonly swift: string
  /**
   * Kotlin declaration lines, emitted in order and joined with `\n  `. `{id}`
   * is replaced by the declaration's Kotlin identifier (every occurrence), so a
   * descriptor may hoist a composition-local into a sibling val
   * (`val {id}Ctx = LocalContext.current`) or wire a launcher after the `val`.
   * A line carries its OWN extra indentation, so a continuation line renders
   * exactly as the hand-written emit did.
   */
  readonly kotlin: readonly string[]
  /**
   * Members the web reads as ACCESSORS (`copied()`) that the native container
   * stores as properties: a zero-argument member call of one lowers to the
   * property read on BOTH targets (Kotlin appends `.value` for members also
   * listed in `kotlinState`).
   */
  readonly accessorReads?: readonly string[]
  /**
   * The property a BARE zero-argument call of the container reads — web
   * accessors like `useOnline()` are called (`net()`); natively it is a
   * property (`net.isOnline`, + `.value` on Kotlin when listed in `kotlinState`).
   */
  readonly callRead?: string
  /**
   * Members that are Compose `MutableState` on Kotlin: a read — member form or
   * zero-argument call form — appends `.value`. Members NOT listed read bare
   * (plain getters, methods). Swift's @Observable properties need no rewrite.
   */
  readonly kotlinState?: readonly string[]
  /**
   * A reactive monitor that must be started or the hook ships frozen at its
   * initial value. `'start-stop'` → Swift `.onAppear { x.start() }` +
   * `.onDisappear { x.stop() }`; `'start'` → `.onAppear` only. Kotlin has no
   * emit-side wiring: its descriptor line is the self-installing
   * `rememberPyreon<Container>()` factory.
   */
  readonly lifecycle?: 'start' | 'start-stop'
  /** `const { x } = useHook()` destructure aliases onto the container. */
  readonly destructure?: true
  /**
   * Members the runtimes declare optional, mapped to their value type — typed
   * as nullable so BOTH emitters wrap the interpolation and the condition
   * lowering fires (web renders nothing; native would print `Optional(…)`).
   */
  readonly optionalFields?: Readonly<Record<string, TypeIR>>
}

const num: TypeIR = { kind: 'number' }
const str: TypeIR = { kind: 'string' }

export const SERVICES: readonly ServiceDescriptor[] = [
  // M3.2 — share sheet. iOS presents a UIActivityViewController from the key
  // window itself; Android needs a Context (hoisted from LocalContext because
  // a composition-local cannot be read inside `remember { }`).
  {
    hook: 'useShare',
    legacyKind: 'share',
    swift: 'PyreonShare()',
    kotlin: ['val {id}Ctx = LocalContext.current', 'val {id} = remember { PyreonShare({id}Ctx) }'],
  },
  // M3.2b — external-URL open. iOS uses the shared application; Android needs a
  // Context for `startActivity`.
  {
    hook: 'useLinking',
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
  {
    hook: 'useHaptics',
    legacyKind: 'haptics',
    swift: 'PyreonHaptics()',
    kotlin: [
      'val {id}Haptic = LocalHapticFeedback.current',
      'val {id} = remember { PyreonHaptics({id}Haptic) }',
    ],
  },
  // M3.3 — local notifications (iOS UNUserNotificationCenter; Android
  // NotificationManager, which needs a Context).
  {
    hook: 'useNotifications',
    legacyKind: 'notifications',
    swift: 'PyreonNotifications()',
    kotlin: [
      'val {id}Ctx = LocalContext.current',
      'val {id} = remember { PyreonNotifications({id}Ctx) }',
    ],
  },
  // M3.5 — biometric gate. `authenticate(reason)` is async/suspend, awaited in
  // an `async` handler. The v1 Kotlin runtime needs no Context.
  {
    hook: 'useBiometrics',
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
  {
    hook: 'useImagePicker',
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
  {
    hook: 'useFilePicker',
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
  {
    hook: 'useCamera',
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
  {
    hook: 'useClipboard',
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
  {
    hook: 'useBluetooth',
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
  {
    hook: 'useWakeLock',
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
  {
    hook: 'useDeviceInfo',
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
  {
    hook: 'useSafeArea',
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
  {
    hook: 'useScreenOrientation',
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
  {
    hook: 'useDeviceMotion',
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
  {
    hook: 'useSpeech',
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
  {
    hook: 'useAudioRecorder',
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
  {
    hook: 'useOnline',
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
  {
    hook: 'usePush',
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
  {
    hook: 'useAppState',
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
  {
    hook: 'useCrashReporter',
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
  {
    hook: 'useGeolocation',
    legacyKind: 'geolocation',
    swift: 'PyreonGeolocation()',
    kotlin: ['val {id} = rememberPyreonGeolocation()'],
    kotlinState: ['latitude', 'longitude', 'accuracy', 'isAuthorized', 'error'],
    destructure: true,
    optionalFields: { latitude: num, longitude: num, accuracy: num, error: ERROR_OBJECT },
  },
  // In-app purchase. A purchase flow is user-triggered, so no lifecycle.
  {
    hook: 'usePayments',
    legacyKind: 'payments',
    swift: 'PyreonPayments()',
    kotlin: ['val {id} = remember { PyreonPayments() }'],
    kotlinState: ['products', 'ownedProductIds', 'purchasing', 'error'],
    destructure: true,
    optionalFields: { purchasing: str, error: ERROR_OBJECT },
  },
]

/** Render a descriptor's Kotlin lines for a Kotlin identifier. */
export function renderKotlinService(s: ServiceDescriptor, id: string): string {
  return s.kotlin.map((line) => line.replaceAll('{id}', () => id)).join('\n  ')
}
