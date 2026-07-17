// useImagePicker — pick an image from the device's photo library (iOS
// PHPickerViewController, Android Photo Picker / PickVisualMedia, a file input
// on the web).
//
// The SECOND @pyreon/hooks service with an ASYNC RESULT (after `useBiometrics`):
// `pick()` returns a `Promise<string | null>` the caller `await`s — a URI
// string for the picked image, or `null` when the user cancels. Under PMTC the
// M4.5 async-await lowering wraps the awaiting handler in a Swift `Task { … }` /
// Kotlin `pyreonAsyncScope.launch { … }`:
//
//     const picker = useImagePicker()
//     <Button onClick={async () => {
//       const uri = await picker.pick()
//       status.set(uri === null ? 'cancelled' : 'picked')
//     }}>Pick</Button>
//
// Compare `uri === null` explicitly rather than testing it for truthiness — JS
// truthiness is not a native `Bool`, and an explicit null comparison is the
// shape PMTC lowers to `uri == nil` (Swift) / `uri == null` (Kotlin).
//
// NO camera permission is required on either platform: both native pickers run
// OUT OF PROCESS (the app never gets photo-library access, only the one asset
// the user explicitly chose), which is why this hook needs no `Info.plist`
// usage description and no Android runtime permission.
//
// The returned URI is opaque and platform-shaped — a `file://` temp-copy URL on
// iOS, a `content://` URI on Android, a `blob:` object URL on the web. Treat it
// as a handle to hand back to an image view / upload, never as a stable path to
// persist.

import { isClient } from '@pyreon/reactivity'

export interface UseImagePickerResult {
  /**
   * Present the platform photo picker and resolve the picked image's URI, or
   * `null` if the user cancelled. Never rejects — an unavailable picker also
   * resolves `null`.
   */
  pick: () => Promise<string | null>
  /**
   * Whether an image picker is available. Web: whether there is a DOM to mount
   * the file input into. Native: always `true` — the runtime's `pick` collapses
   * an unavailable picker to `null`.
   */
  isAvailable: () => boolean
}

/**
 * Pick an image from the device's photo library — PHPickerViewController (iOS),
 * the Android Photo Picker (`PickVisualMedia`), a hidden file input (web).
 *
 * Requires no photo-library permission on either native platform: both system
 * pickers run out of process and hand back only the chosen asset.
 *
 * @example
 * ```tsx
 * const picker = useImagePicker()
 * const status = signal<'idle' | 'picked' | 'cancelled'>('idle')
 *
 * <button onClick={async () => {
 *   const uri = await picker.pick()
 *   status.set(uri === null ? 'cancelled' : 'picked')
 * }}>Pick a photo</button>
 * ```
 */
export function useImagePicker(): UseImagePickerResult {
  return {
    pick: () => {
      if (!isClient) return Promise.resolve(null)
      return new Promise<string | null>((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        // Keep the input out of layout — it is only a programmatic trigger.
        input.style.display = 'none'
        document.body.appendChild(input)

        // Settle EXACTLY once and always detach the input: `change` and
        // `cancel` are mutually exclusive per pick, but a browser that fires
        // neither (or both) must not leak the node or double-resolve.
        let settled = false
        const settle = (value: string | null) => {
          if (settled) return
          settled = true
          input.remove()
          resolve(value)
        }

        input.addEventListener('change', () => {
          const file = input.files?.[0]
          settle(file ? URL.createObjectURL(file) : null)
        })
        // Fired when the user dismisses the file dialog without choosing.
        // Not universal across older browsers — hence the `settled` guard
        // rather than relying on exactly one of the two arriving.
        input.addEventListener('cancel', () => settle(null))

        input.click()
      })
    },
    isAvailable: () => isClient,
  }
}
