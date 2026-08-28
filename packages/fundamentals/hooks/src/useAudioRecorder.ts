import { isClient, onCleanup, signal } from '@pyreon/reactivity'

import { warnIfInsecureContext } from './secure-context'

export type AudioRecorderControls = {
  /** True when the platform can record at all. */
  supported: () => boolean
  /** True while a recording is in progress. */
  recording: () => boolean
  /**
   * Begin recording. Resolves to whether it actually started — a denied
   * microphone permission is an ordinary outcome, not an exception.
   */
  start: () => Promise<boolean>
  /**
   * Stop and resolve with a URL for the captured audio, or `null` if nothing
   * was recorded. On the web that is an object URL (revoke it when done); on
   * iOS and Android it is a file URL.
   */
  stop: () => Promise<string | null>
  /** Last failure, or `''`. */
  error: () => string
}

/**
 * Record audio from the microphone — voice notes, voice messages, dictation.
 *
 * ## Why `start()` resolves rather than throws
 *
 * A denied microphone permission is the single most likely outcome of this
 * call, and it is a normal branch in any UI that uses it, not an exceptional
 * one. So it resolves `false` and leaves `error()` set, the same contract
 * `useWakeLock.request()` uses for a refused screen lock. Callers get an
 * `if`, not a `try`.
 *
 * ## What `stop()` hands back
 *
 * A URL, because that is the one representation all three targets can
 * produce and every consumer can use — feed it to `<Audio src>`, upload it,
 * or persist it. Handing back a platform-shaped buffer would push the
 * difference onto the caller.
 *
 * @example
 * ```tsx
 * const rec = useAudioRecorder()
 * const done = async () => {
 *   const url = await rec.stop()
 *   if (url !== null) clip.set(url)
 * }
 * ```
 */
export function useAudioRecorder(): AudioRecorderControls {
  const recording = signal(false)
  const error = signal('')

  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  /** The in-flight start, so concurrent callers share one stream. */
  let starting: Promise<boolean> | null = null
  let chunks: Blob[] = []

  const supported = () => {
    const ok =
      isClient &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia !== undefined &&
      typeof MediaRecorder !== 'undefined'
    if (!ok) warnIfInsecureContext('useAudioRecorder')
    return ok
  }

  const teardown = () => {
    // Releasing the tracks is what turns the OS recording indicator off. A
    // stream outliving its view leaves the mic hot with nothing listening —
    // the privacy-visible form of a leak.
    for (const t of stream?.getTracks() ?? []) t.stop()
    stream = null
    recorder = null
    chunks = []
  }

  if (isClient) onCleanup(teardown)

  return {
    supported,
    recording,
    error,

    start: async (): Promise<boolean> => {
      // Guard INLINE rather than through `supported()`. The SSR lint rule
      // cannot trace a cross-function guard, and an explicit early return
      // documents the contract at the site that touches the global. Same
      // condition `supported()` evaluates, so behaviour is unchanged.
      if (
        typeof navigator === 'undefined' ||
        navigator.mediaDevices?.getUserMedia === undefined ||
        typeof MediaRecorder === 'undefined'
      ) {
        warnIfInsecureContext('useAudioRecorder')
        error.set('Audio recording is not available on this platform')
        return false
      }
      if (recording()) return true
      // `recording` only flips AFTER the await, so two calls arriving before
      // getUserMedia resolves both pass the check and both open a microphone
      // stream — the second overwrites `stream` and the first is orphaned,
      // leaving the mic indicator on with nothing able to stop it.
      if (starting !== null) return starting
      const inFlight = (async (): Promise<boolean> => {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        chunks = []
        const r = new MediaRecorder(stream)
        r.ondataavailable = (e: BlobEvent) => {
          if (e.data.size > 0) chunks.push(e.data)
        }
        recorder = r
        r.start()
        error.set('')
        recording.set(true)
        return true
      })().catch(() => {
        // Denied permission, no device, or an insecure context. All ordinary
        // — the caller branches on the boolean.
        //
        // On the shared promise, not around the await: a caller that joined
        // an in-flight start at the guard above must get the same `false`,
        // not the raw rejection the first caller's catch absorbed.
        error.set('Microphone permission was denied or no device is available')
        teardown()
        recording.set(false)
        return false
      })
      starting = inFlight
      try {
        return await inFlight
      } finally {
        if (starting === inFlight) starting = null
      }
    },

    stop: async (): Promise<string | null> => {
      const r = recorder
      if (r === null || !recording()) return null
      const done = new Promise<string | null>((resolve) => {
        r.onstop = () => {
          const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' })
          // A zero-length recording is `null` rather than an empty URL: an
          // object URL that plays nothing is harder to debug than an absence.
          resolve(blob.size > 0 ? URL.createObjectURL(blob) : null)
        }
      })
      r.stop()
      recording.set(false)
      const url = await done
      teardown()
      return url
    },
  }
}
