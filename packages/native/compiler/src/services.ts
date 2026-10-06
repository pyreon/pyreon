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
 * Deliberately NOT here (they stay hand-written until their satellite
 * behaviour has a vocabulary): services with a read-site rewrite
 * (`useOnline` → `.isOnline`, `useClipboard`, `useDatabase`, `usePayments`, the
 * hardware services keyed by a per-service name set), a reactive field, a
 * lifecycle start/stop, constructor arguments taken from the call, or a
 * struct-typed generic (`useAuth<T>`, `useFetch<T>`, `useStream<T>`).
 */

export interface ServiceDescriptor {
  /** The hook the author calls, e.g. `useShare`. */
  readonly hook: string
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
}

export const SERVICES: readonly ServiceDescriptor[] = [
  // M3.2 — share sheet. iOS presents a UIActivityViewController from the key
  // window itself; Android needs a Context (hoisted from LocalContext because
  // a composition-local cannot be read inside `remember { }`).
  {
    hook: 'useShare',
    swift: 'PyreonShare()',
    kotlin: ['val {id}Ctx = LocalContext.current', 'val {id} = remember { PyreonShare({id}Ctx) }'],
  },
  // M3.2b — external-URL open. iOS uses the shared application; Android needs a
  // Context for `startActivity`.
  {
    hook: 'useLinking',
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
    swift: 'PyreonCamera(presenter: UIKitCameraPresenter())',
    kotlin: [
      'val {id} = remember { PyreonCamera() }',
      '{id}.launch = rememberCameraLauncher { uri -> {id}.onResult(uri) }',
    ],
  },
]

export const SERVICE_BY_HOOK: ReadonlyMap<string, ServiceDescriptor> = new Map(
  SERVICES.map((s) => [s.hook, s]),
)

/** The descriptor for a `service` declaration; the parser only emits known hooks. */
export function serviceFor(hook: string): ServiceDescriptor {
  const s = SERVICE_BY_HOOK.get(hook)
  if (s === undefined) {
    throw new Error(
      `[Pyreon] native service \`${hook}\` has no descriptor in services.ts — a \`service\` declaration must name a hook listed in SERVICES.`,
    )
  }
  return s
}

/** Render a descriptor's Kotlin lines for a Kotlin identifier. */
export function renderKotlinService(s: ServiceDescriptor, id: string): string {
  return s.kotlin.map((line) => line.replaceAll('{id}', () => id)).join('\n  ')
}
