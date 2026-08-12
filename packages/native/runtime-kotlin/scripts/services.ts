/**
 * The service model — one source of truth for WHICH Kotlin sources get verified
 * and HOW.
 *
 * This used to be three hand-written `&&` chains in package.json (`build` with
 * 38 invocations, `test` with 44, `typecheck` with 37), each a ~3,000-character
 * JSON string. A list repeated three times fails in one specific way: it goes
 * wrong exactly when a service is ADDED, and nothing says so.
 *
 * It had already gone wrong — eight services were missing from at least one
 * chain. Seven (PyreonBiometrics, PyreonFilePicker, PyreonHaptics,
 * PyreonImagePicker, PyreonLinking, PyreonNotifications, PyreonShare) were
 * verified by `test` but by neither `build` nor `typecheck`; PyreonGeolocation-
 * Android by `build` alone.
 *
 * Both consumers (`verify-all.ts`, `check-service-coverage.ts`) import from
 * here, which is also why the model lives in its own file: they used to import
 * from each other, and a cycle between a gate and its runner is a startup crash
 * waiting for whichever one is entered first.
 */

/**
 * Sources that genuinely cannot be verified against stubs yet.
 *
 * A ratchet: the list may only SHRINK. An entry whose file is gone — or that
 * turns out to be verifiable after all — FAILS `check-service-coverage`, so it
 * cannot quietly outlive its reason. Each needs one.
 */
export const EXEMPT: Record<string, string> = {
  PyreonAssets: 'needs android.util.Log + androidx.compose.ui.text.font stubs',
  PyreonWebView: 'needs android.os.Handler/Looper + android.webkit stubs',
}

/**
 * Services that cannot run their smoke `main()` and are typechecked only.
 *
 * Whether a service can RUN is a fact about the service — an Android-surface
 * module needs a device wherever it is invoked from. Recording it once is what
 * removed a real inconsistency: `build` and `test` previously disagreed about
 * the mode of 22 services, with no principled basis for the difference.
 */
export const TYPECHECK_ONLY = new Set([
  'PyreonStorageBackends',
  'PyreonJson',
  'PyreonMachine',
  'PyreonModel',
  'PyreonStore',
  'PyreonStorageAndroid',
  'PyreonNetworkStatusAndroid',
  'PyreonPushNotificationsAndroid',
  'PyreonAppStateAndroid',
  'PyreonCrashReporterAndroid',
  'PyreonVideoPlayerAndroid',
  'PyreonGeolocationAndroid',
  'PyreonSecureStorageAndroid',
  'PyreonDatabaseAndroid',
  'PyreonHttpOkHttp',
  'PyreonWebSocketOkHttp',
])

export interface ServicePlan {
  name: string
  typecheckOnly: boolean
}

/**
 * The services to verify, DERIVED from the sources on disk.
 *
 * Derivation is the point: a new `.kt` file is verified the moment it exists,
 * rather than when someone remembers to edit three strings.
 *
 * This decides the LIST only. Services still compile ONE at a time against
 * per-service stubs, which is deliberate — several declare their own minimal
 * `android.content.Context` with just the members that module touches, because
 * a superset stub masks real breakage. Compiling them as one set would force
 * those stubs to merge and weaken the gates that already work.
 *
 * Pure — unit-tested.
 */
export function planServices(
  sourceFiles: readonly string[],
  mode: 'full' | 'typecheck',
  exempt: Readonly<Record<string, string>> = EXEMPT,
): ServicePlan[] {
  return sourceFiles
    .filter((f) => f.endsWith('.kt'))
    .map((f) => f.slice(0, -'.kt'.length))
    .filter((name) => !(name in exempt))
    .sort()
    .map((name) => ({
      name,
      typecheckOnly: mode === 'typecheck' || TYPECHECK_ONLY.has(name),
    }))
}
