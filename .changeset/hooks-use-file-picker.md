---
'@pyreon/hooks': minor
---

Add `useFilePicker()` — pick a document/file from the device.

`pick()` returns a `Promise<string | null>` you `await`: a URI string for the
picked file, or `null` when the user cancels (it never rejects). This is the
document sibling of `useImagePicker` (any file — a PDF, a `.csv`, a `.zip` — not
just photos) and the third async-result hook.

```tsx
const files = useFilePicker()
const status = signal<'idle' | 'picked' | 'cancelled'>('idle')

<button onClick={async () => {
  const uri = await files.pick()
  status.set(uri === null ? 'cancelled' : 'picked')
}}>Pick a file</button>
```

Compare the result to `null` explicitly rather than testing it for truthiness —
that is also the shape the multi-target compiler lowers to a native optional
test.

Web uses a hidden `<input type="file">` (no `accept` filter, so any file type)
and resolves an object URL; the input is always detached once the pick settles.
Under PMTC it lowers to `UIDocumentPickerViewController` (iOS) and the Storage
Access Framework `OpenDocument` (Android).

No storage permission is required on either native platform: both system pickers
run out of process and hand back only the document the user chose, so there is no
iOS entitlement and no Android runtime permission to request.

The returned URI is an opaque, ephemeral, platform-shaped handle (`file://` temp
copy on iOS, `content://` on Android, `blob:` on the web) — read it or upload it
promptly rather than persisting it.

Saving/exporting a file is a separate native flow on every platform and is
intentionally out of scope here (a tracked follow-up).
