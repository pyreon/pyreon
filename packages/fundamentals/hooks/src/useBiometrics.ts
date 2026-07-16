// useBiometrics — a biometric authentication gate (Face ID / Touch ID on iOS,
// BiometricPrompt on Android; feature-detected on the web).
//
// The FIRST @pyreon/hooks service with an ASYNC RESULT: `authenticate(reason)`
// returns a `Promise<boolean>` the caller `await`s. Under PMTC this lowers to
// the native biometric APIs (iOS `LAContext.evaluatePolicy`, Android
// `BiometricPrompt`), and the M4.5 async-await lowering wraps the awaiting
// handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`:
//
//     const bio = useBiometrics()
//     <Button onClick={async () => {
//       const ok = await bio.authenticate('Unlock')
//       status.set(ok ? 'unlocked' : 'denied')
//     }}>Unlock</Button>
//
// WEB (v1): a real biometric assertion on the web is a WebAuthn ceremony, which
// needs a server-issued challenge AND a previously-registered credential — a
// client-only hook cannot complete it. So the web `authenticate` resolves
// `false` (never authenticated) and never rejects, and `isAvailable`
// feature-detects a platform authenticator (`PublicKeyCredential`). For real
// web biometric auth, drive the WebAuthn API with your backend. Native
// (iOS/Android) is the primary target — this mirrors the shape the PMTC native
// compiler recognizes.

import { isClient } from '@pyreon/reactivity'

export interface UseBiometricsResult {
  /**
   * Prompt for biometric authentication. Resolves `true` ONLY on a successful
   * match; any failure, cancellation, or an unavailable / unenrolled device
   * resolves `false` (it never rejects). `reason` is shown in the system prompt
   * (iOS / Android) and ignored on web.
   */
  authenticate: (reason: string) => Promise<boolean>
  /**
   * Whether a platform biometric authenticator is present. Web: feature-detects
   * `window.PublicKeyCredential`. Native: always `true` — the runtime's
   * `authenticate` collapses the unavailable / unenrolled case to `false`.
   */
  isAvailable: () => boolean
}

/**
 * A biometric authentication gate — Face ID / Touch ID (iOS), BiometricPrompt
 * (Android), feature-detected WebAuthn presence (web).
 *
 * @example
 * ```tsx
 * const bio = useBiometrics()
 * const status = signal<'idle' | 'unlocked' | 'denied'>('idle')
 *
 * <button onClick={async () => {
 *   const ok = await bio.authenticate('Unlock your vault')
 *   status.set(ok ? 'unlocked' : 'denied')
 * }}>Unlock</button>
 * ```
 */
export function useBiometrics(): UseBiometricsResult {
  return {
    // Web v1: a real WebAuthn assertion needs a server-issued challenge + a
    // registered credential — out of scope for a client-only hook — so resolve
    // false (never authenticated) without rejecting.
    authenticate: (_reason: string) => Promise.resolve(false),
    isAvailable: () => {
      if (!isClient) return false
      return typeof (window as { PublicKeyCredential?: unknown }).PublicKeyCredential === 'function'
    },
  }
}
