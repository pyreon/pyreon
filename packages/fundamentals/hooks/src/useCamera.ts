import { isClient } from '@pyreon/reactivity'

export interface UseCameraResult {
  /**
   * Open the platform camera and resolve the captured photo's URI, or `null`
   * if the user cancelled. Never rejects — an unavailable camera also
   * resolves `null`.
   */
  capture: () => Promise<string | null>
  /** Whether a camera capture flow is available. */
  isAvailable: () => boolean
}

/**
 * Take a photo with the device camera — the system capture UI on every
 * target, resolving a URI.
 *
 * ## Why this is a hook and not a `<CameraView>` primitive
 *
 * Because the common need is "take a photo", and that crosses perfectly
 * through the platform's own capture UI: `<input capture>` on the web,
 * `UIImagePickerController` on iOS, `ACTION_IMAGE_CAPTURE` on Android. It
 * needs no preview host view, and the system UI owns the permission prompt,
 * so there is no permission plumbing to get subtly different per platform.
 *
 * A CUSTOM in-app viewfinder is deliberately out of scope. That is genuinely
 * platform-shaped — an `AVCaptureSession` layer, a CameraX `PreviewView` and
 * a `<video>` element are not one thing wearing three hats — and a surface
 * that only half-crosses is worse than one that says what it covers. Reach
 * for `useNativeModule` when you need a bespoke viewfinder, the same escape
 * hatch `useBluetooth` names for GATT.
 *
 * Mirrors {@link useImagePicker} exactly, since the two differ only in which
 * system flow they open.
 *
 * @example
 * ```tsx
 * const cam = useCamera()
 * const shoot = async () => {
 *   const uri = await cam.capture()
 *   if (uri !== null) photo.set(uri)
 * }
 * ```
 */
export function useCamera(): UseCameraResult {
  return {
    isAvailable: () => isClient,

    capture: () =>
      new Promise<string | null>((resolve) => {
        if (!isClient) {
          resolve(null)
          return
        }
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        // The whole reason this works on the web: `capture` asks a mobile
        // browser for the CAMERA rather than the gallery. Desktop browsers
        // ignore it and show a file dialog, which is the honest degradation —
        // there is no camera flow to open.
        input.setAttribute('capture', 'environment')
        input.style.display = 'none'

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
        // Cancel fires on modern engines; without it a dismissed sheet would
        // leave the promise pending forever and the input in the DOM.
        input.addEventListener('cancel', () => settle(null))

        document.body.append(input)
        input.click()
      }),
  }
}
