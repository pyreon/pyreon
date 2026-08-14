import { useBluetooth } from './useBluetooth'
import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/hooks
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Name and version are DERIVED from package.json, so a
// release bump can never leave this reporting a frozen version.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export type { BreakpointMap } from './useBreakpoint'
export { useBreakpoint } from './useBreakpoint'
export { useClickOutside } from './useClickOutside'
export type { UseClipboardResult } from './useClipboard'
export { useBluetooth }
export type { BluetoothDevice, UseBluetoothResult } from './useBluetooth'
export { useClipboard } from './useClipboard'
export type { WakeLockControls } from './useWakeLock'
export { useWakeLock } from './useWakeLock'
export type { DeviceInfo, DevicePlatform, DeviceScreen } from './useDeviceInfo'
export { useDeviceInfo } from './useDeviceInfo'
export type { SafeAreaInsets } from './useSafeArea'
export { useSafeArea } from './useSafeArea'
export type { OrientationState, ScreenOrientation } from './useScreenOrientation'
export { useScreenOrientation } from './useScreenOrientation'
export type {
  HapticImpactStyle,
  HapticNotificationType,
  UseHapticsResult,
} from './useHaptics'
export { useHaptics } from './useHaptics'
// Web half of the shared geolocation hook. The native half already existed
// (PMTC lowers `useGeolocation()` to PyreonGeolocation on both targets); with
// no web export the import did not resolve, so an app using it could not build
// for web at all.
export { useGeolocation } from './useGeolocation'
// useMap — the web half of another natively-lowered hook (`PyreonMapState`).
// State only: camera + markers + selection, exactly as the native container
// holds them. Rendering stays the app's choice on every target.
export { useMap } from './useMap'
export type {
  PyreonMapCamera,
  PyreonMapMarker,
  UseMapOptions,
  UseMapResult,
} from './useMap'
// useWebSocket — the web half of a hook PMTC has always lowered natively
// (`PyreonWebSocket` on both targets, with a synthesized auto-connect on
// mount). Without this export the shared import resolved on iOS and Android
// and nowhere else — the same gap useGeolocation and useDatabase had.
export { useWebSocket } from './useWebSocket'
export type { UseWebSocketOptions, UseWebSocketResult } from './useWebSocket'
// useAuth — the web half of the auth-state container PMTC lowers to
// `PyreonAuth<User>` on both native targets (device-proven incl. session
// rehydration, #2620). Without this export the flagship finance real app's
// `import { useAuth } from '@pyreon/hooks'` resolved on iOS and Android and
// nowhere else — the same gap useGeolocation/useDatabase/useWebSocket had.
export { useAuth } from './useAuth'
export type { UseAuthResult, UseAuthStatus } from './useAuth'
// usePush / usePayments — the LAST two web halves of natively-lowered hooks.
// With these, every hook in the compiler's NATIVE_LOWERED_HOOKS registry has
// a web implementation (same resolvability gap as the four before them).
export { usePush } from './usePush'
export type { PyreonPushHandlers, PyreonPushNotification, UsePushResult } from './usePush'
export { usePayments } from './usePayments'
export type { PyreonPaymentActions, PyreonProduct, UsePaymentsResult } from './usePayments'
// useSecureStorage — the web half of the imperative secret store
// (Keychain on iOS, AndroidKeyStore AES-GCM on Android; module-scoped
// in-memory on web, which has no OS secret store — persisting secrets to
// localStorage would be the exact bug the hook exists to prevent). Same
// resolvability gap as useGeolocation/useWebSocket: without the web export
// the shared import only built on native.
export { useSecureStorage } from './useSecureStorage'
export type { SecureStorage } from './useSecureStorage'
export type { UseGeolocationOptions, UseGeolocationResult } from './useGeolocation'
// Web half of the shared document store. Same gap as useGeolocation: the
// native half is device-proven, the web half did not exist — and the
// kitchen-sink counter example imports `useDatabase` from `@pyreon/primitives`,
// which does not export it. PMTC matches hook NAMES and never resolves
// imports, so nothing caught it.
export { useDatabase } from './useDatabase'
export type { PyreonRecord, UseDatabaseResult } from './useDatabase'
export type { UseShareResult } from './useShare'
export { useShare } from './useShare'
export type { UseLinkingResult } from './useLinking'
export { useLinking } from './useLinking'
export type { UseNotificationsResult } from './useNotifications'
export { useNotifications } from './useNotifications'
export type { UseBiometricsResult } from './useBiometrics'
export { useBiometrics } from './useBiometrics'
export type { UseImagePickerResult } from './useImagePicker'
export { useImagePicker } from './useImagePicker'
export type { UseFilePickerResult } from './useFilePicker'
export { useFilePicker } from './useFilePicker'
export { useColorScheme } from './useColorScheme'
export { useSizeClass } from './useSizeClass'
export type { UseControllableState } from './useControllableState'
export { useControllableState } from './useControllableState'
export type { UseCounterOptions, UseCounterResult } from './useCounter'
export { useCounter } from './useCounter'
export type { UseDebouncedCallback } from './useDebouncedCallback'
export { useDebouncedCallback } from './useDebouncedCallback'
export { useDebouncedValue } from './useDebouncedValue'
export type { UseDialogResult } from './useDialog'
export { useDialog } from './useDialog'
export type { DocumentVisibility } from './useDocumentVisibility'
export { useDocumentVisibility } from './useDocumentVisibility'
export type { Size } from './useElementSize'
export { useElementSize } from './useElementSize'
export { useEventListener } from './useEventListener'
export type { UseFetchResult } from './useFetch'
export { useFetch } from './useFetch'
export type { UseFocusResult } from './useFocus'
export { useFocus } from './useFocus'
export type { InitialFocusTarget, UseFocusTrapOptions } from './useFocusTrap'
export { useFocusTrap } from './useFocusTrap'
export { useFocusReturn } from './useFocusReturn'
export type { UseFocusReturnOptions } from './useFocusReturn'
export { useInertOthers } from './useInertOthers'
export type { UseInertOthersOptions } from './useInertOthers'
export type { UseHoverResult } from './useHover'
export { useHover } from './useHover'
export type { UseIdleOptions } from './useIdle'
export { useIdle } from './useIdle'
export type { UseInfiniteScrollOptions, UseInfiniteScrollResult } from './useInfiniteScroll'
export { useInfiniteScroll } from './useInfiniteScroll'
export { useIntersection } from './useIntersection'
export type { UseInterval } from './useInterval'
export { useInterval } from './useInterval'
export type { UseIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect'
export { default as useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect'
export { useKeyboard } from './useKeyboard'
export type { UseLatest } from './useLatest'
export { useLatest } from './useLatest'
export { useMediaQuery } from './useMediaQuery'
export type { UseMergedRef } from './useMergedRef'
export { useMergedRef } from './useMergedRef'
export { useOnline } from './useOnline'
export type { AppStatePhase } from './useAppState'
export { useAppState } from './useAppState'

// useCrashReporter — the web half of the PyreonCrashReporter container PMTC
// lowers to (capture via window.onerror/unhandledrejection, persist to
// localStorage, rehydrate the previous session's report). The vendor
// transport is app-wired via setCrashTransport (the native registry mirror).
export { useCrashReporter } from './useCrashReporter'
export { setCrashTransport } from './useCrashReporter'
export type { UseCrashReporterResult } from './useCrashReporter'
export { usePrevious } from './usePrevious'
export { useReducedMotion } from './useReducedMotion'
export { useScrollLock } from './useScrollLock'
export type { UseThrottledCallback } from './useThrottledCallback'
export { useThrottledCallback } from './useThrottledCallback'
export type { UseTimeAgoOptions } from './useTimeAgo'
export { useTimeAgo } from './useTimeAgo'
export type { UseTimeout } from './useTimeout'
export { useTimeout } from './useTimeout'
export type { UseToggleResult } from './useToggle'
export { useToggle } from './useToggle'
export type { UseUpdateEffect } from './useUpdateEffect'
export { useUpdateEffect } from './useUpdateEffect'
export type { WindowSize } from './useWindowResize'
export { useWindowResize } from './useWindowResize'
export type { ScrollPosition, UseWindowScrollResult } from './useWindowScroll'
export { useWindowScroll } from './useWindowScroll'
