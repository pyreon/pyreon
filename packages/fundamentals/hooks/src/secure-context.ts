/**
 * Why did that browser API come back `undefined`?
 *
 * A dozen hooks in this package wrap APIs the browser gates behind a SECURE
 * CONTEXT — `useCamera`, `useGeolocation`, `useDeviceMotion`,
 * `useAudioRecorder`, `useSpeech`, `useBluetooth`, `useClipboard`,
 * `useNotifications`, `usePush`, `useShare`, `useWakeLock`. On an insecure
 * origin the browser does not throw and does not warn: it simply does not
 * define the API. So the hook reports `supported() === false` and the
 * developer is left with "geolocation doesn't work", no error, nothing to
 * search for.
 *
 * That is invisible on a laptop, because `http://localhost` IS a secure
 * context. It bites the moment you open the app on a phone, where the origin
 * is `http://192.168.1.24:3000` — which is exactly where these hooks need
 * testing, since a laptop has no accelerometer and its webcam is not the
 * camera you care about.
 *
 * This turns that dead end into one line naming the cause and the fix.
 */

import { isServer } from '@pyreon/reactivity'

/** Warn at most once per API, per page. A hook may be mounted many times. */
const warned = new Set<string>()

/**
 * Report an unavailable API when — and only when — an insecure origin is
 * provably the reason.
 *
 * The gating is the point. `navigator.bluetooth` is missing in Firefox at any
 * origin, and `wakeLock` was missing in Safari for years; blaming the origin
 * for those would send someone to configure TLS for a problem TLS cannot fix.
 * So this stays silent unless `isSecureContext` is actually `false`, which
 * makes the message trustworthy when it does appear.
 *
 * @param api - what the user called, e.g. `'useGeolocation'`.
 */
export function warnIfInsecureContext(api: string): void {
  if (process.env.NODE_ENV === 'production') return
  // `isServer` rather than a hand-rolled `typeof window` check: it is the
  // canonical primitive (and keyed on `document`, which is the reliable
  // "is there a DOM" test — `window` is polyfilled in some Node setups).
  if (isServer) return
  // `isSecureContext` is universally supported; if it is missing we cannot
  // conclude anything, so we say nothing rather than guess.
  if (typeof window.isSecureContext !== 'boolean') return
  if (window.isSecureContext) return
  if (warned.has(api)) return
  warned.add(api)

  console.warn(
    `[Pyreon] ${api} needs a secure context, and ${window.location.origin} is not one.\n` +
      '\n' +
      "  The browser doesn't expose this API over plain HTTP on a non-loopback\n" +
      '  host, so the hook reports unsupported. This is the usual cause of\n' +
      '  "it works on my laptop but not on my phone".\n' +
      '\n' +
      '  Serve the dev server over HTTPS:\n' +
      '\n' +
      "      import { https } from '@pyreon/zero/server'\n" +
      '      plugins: [zero(), https({ lan: true })]\n' +
      '\n' +
      '  `lan: true` certifies this machine\'s network address and binds to it,\n' +
      '  so a device on the same network gets a secure context too.',
  )
}

/**
 * Reset the once-per-API memo. Test-only — the module-level `Set` is
 * deliberately process-wide, and without this a spec asserting the warning
 * would pass or fail depending on which spec ran first.
 */
export function __resetSecureContextWarnings(): void {
  warned.clear()
}
