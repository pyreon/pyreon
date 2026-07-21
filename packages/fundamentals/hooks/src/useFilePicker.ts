// useFilePicker — pick a document/file from the device (iOS
// UIDocumentPickerViewController, Android Storage Access Framework
// `OpenDocument`, a file input on the web).
//
// The THIRD @pyreon/hooks service with an ASYNC RESULT (after `useBiometrics`
// and `useImagePicker`): `pick()` returns a `Promise<string | null>` the caller
// `await`s — a URI string for the picked file, or `null` when the user cancels.
// Under PMTC the M4.5 async-await lowering wraps the awaiting handler in a Swift
// `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`:
//
//     const files = useFilePicker()
//     <Button onClick={async () => {
//       const uri = await files.pick()
//       status.set(uri === null ? 'cancelled' : 'picked')
//     }}>Pick</Button>
//
// Compare `uri === null` explicitly rather than testing it for truthiness — JS
// truthiness is not a native `Bool`, and the explicit null comparison is the
// shape PMTC lowers to `uri == nil` (Swift) / `uri == null` (Kotlin).
//
// This is the DOCUMENT sibling of `useImagePicker` (which is photo-library
// specific): it picks ANY file — a PDF, a `.csv`, a `.zip` — through the
// system document browser, whereas `useImagePicker` opens the photo picker.
//
// NO storage permission is required on either platform: both native pickers run
// OUT OF PROCESS (the app never gains broad filesystem access, only the one
// document the user explicitly chose), which is why this hook needs no iOS
// entitlement and no Android runtime permission.
//
// The returned URI is opaque and platform-shaped — a `file://` temp-copy URL on
// iOS, a `content://` URI on Android, a `blob:` object URL on the web. Treat it
// as a handle to hand back to a reader / upload, never as a stable path to
// persist.
//
// SAVING a file (write/export) is a separate native flow on every platform
// (iOS export picker, Android `CreateDocument` + a write step, web File System
// Access) and is intentionally out of scope here — see `useFilePicker`'s docs
// for the tracked save follow-up.

import { isClient } from '@pyreon/reactivity'

export interface UseFilePickerResult {
  /**
   * Present the platform document picker and resolve the picked file's URI, or
   * `null` if the user cancelled. Never rejects — an unavailable picker also
   * resolves `null`.
   */
  pick: () => Promise<string | null>
  /**
   * Whether a file picker is available. Web: whether there is a DOM to mount
   * the file input into. Native: always `true` — the runtime's `pick` collapses
   * an unavailable picker to `null`.
   */
  isAvailable: () => boolean
}

/**
 * Pick a document/file from the device — UIDocumentPickerViewController (iOS),
 * the Storage Access Framework `OpenDocument` (Android), a hidden file input
 * (web). The document sibling of {@link useImagePicker}.
 *
 * Requires no storage permission on either native platform: both system pickers
 * run out of process and hand back only the chosen document.
 *
 * @example
 * ```tsx
 * const files = useFilePicker()
 * const status = signal<'idle' | 'picked' | 'cancelled'>('idle')
 *
 * <button onClick={async () => {
 *   const uri = await files.pick()
 *   status.set(uri === null ? 'cancelled' : 'picked')
 * }}>Pick a file</button>
 * ```
 */
export function useFilePicker(): UseFilePickerResult {
  return {
    pick: () => {
      if (!isClient) return Promise.resolve(null)
      return new Promise<string | null>((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        // No `accept` filter — a document picker accepts any file type. Keep the
        // input out of layout: it is only a programmatic trigger.
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
