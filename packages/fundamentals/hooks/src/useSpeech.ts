import { isClient, signal } from '@pyreon/reactivity'
import { onHookCleanup } from './lifecycle'

export type SpeechControls = {
  /** True when the platform can synthesise speech. */
  supported: () => boolean
  /** True while something is being spoken. */
  speaking: () => boolean
  /**
   * Speak the text. Resolves to whether it started — an unsupported platform
   * is an ordinary `false`, not a throw.
   */
  speak: (text: string) => Promise<boolean>
  /** Stop immediately, discarding anything queued. */
  stop: () => void
}

/**
 * Speak text aloud — `speechSynthesis` on the web, `AVSpeechSynthesizer` on
 * iOS, `TextToSpeech` on Android.
 *
 * Rate, pitch and voice selection are deliberately out of scope for now: the
 * three platforms disagree on their ranges and on how voices are identified,
 * so exposing them would mean either three different meanings behind one
 * name, or a lowest-common-denominator that is useless on all three. Plain
 * speech is the part that genuinely crosses.
 *
 * @example
 * ```tsx
 * const speech = useSpeech()
 * <Button onClick={() => speech.speak(article())}>Read aloud</Button>
 * ```
 */
export function useSpeech(): SpeechControls {
  const speaking = signal(false)

  const supported = () =>
    isClient && typeof speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined'

  // The utterance THIS hook started and that has not finished yet. The
  // synthesiser is a process-wide singleton, so every decision below is keyed
  // on it: state only follows our own current utterance, and cancel() only
  // runs when we are the one speaking.
  let current: SpeechSynthesisUtterance | null = null

  const stop = () => {
    if (!supported()) return
    // Do not cancel speech another hook (or another component) started:
    // unmounting a component that never spoke used to silence the whole page.
    if (current === null) return
    current = null
    speechSynthesis.cancel()
    speaking.set(false)
  }

  if (isClient) {
    // Speech outlives the page's DOM on every browser: navigating away with
    // an utterance in flight leaves it talking over the next screen.
    onHookCleanup(stop)
  }

  return {
    supported,
    speaking,
    stop,

    speak: async (text: string): Promise<boolean> => {
      if (!supported() || text.length === 0) return false
      // Cancel first: queueing is the web default, so without this a second
      // press talks over itself instead of replacing.
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      // The replaced utterance's `onend` fires ASYNCHRONOUSLY after that
      // cancel() — i.e. after the new one is already speaking — so an
      // unconditional `speaking.set(false)` flipped the flag off mid-speech.
      // Only the current utterance may end the speaking state.
      const done = () => {
        if (current !== u) return
        current = null
        speaking.set(false)
      }
      u.onend = done
      u.onerror = done
      current = u
      speechSynthesis.speak(u)
      speaking.set(true)
      return true
    },
  }
}
