---
'@pyreon/hooks': minor
---

Add `useImagePicker()` — pick an image from the device's photo library.

`pick()` returns a `Promise<string | null>` you `await`: a URI string for the
picked image, or `null` when the user cancels (it never rejects). This is the
second async-result hook after `useBiometrics`.

```tsx
const picker = useImagePicker()
const status = signal<'idle' | 'picked' | 'cancelled'>('idle')

<button onClick={async () => {
  const uri = await picker.pick()
  status.set(uri === null ? 'cancelled' : 'picked')
}}>Pick a photo</button>
```

Compare the result to `null` explicitly rather than testing it for truthiness —
that is also the shape the multi-target compiler lowers to a native optional
test.

Web uses a hidden `<input type="file" accept="image/*">` and resolves an object
URL; the input is always detached once the pick settles. Under PMTC it lowers to
`PHPickerViewController` (iOS) and the Android Photo Picker (`PickVisualMedia`).

No photo-library permission is required on either native platform: both system
pickers run out of process and hand back only the asset the user chose, so there
is no `Info.plist` usage description and no Android runtime permission to
request.

The returned URI is an opaque, ephemeral, platform-shaped handle (`file://` temp
copy on iOS, `content://` on Android, `blob:` on the web) — hand it to an image
view or an upload rather than persisting it.
