// fileFromUri — turn the URI a picker or the camera resolved into a `File` an upload can send.
//
// `useImagePicker` / `useFilePicker` / `useCamera` resolve a URI string (a `blob:` object URL on the web, a `file://`
// copy on iOS, a `content://` URI on Android). A URI is a HANDLE, not the file: passing it straight into a request
// body sends the URI's TEXT on every platform. This is the step in between, and it reads the same in shared source:
//
//     const uri = await picker.pick()
//     if (uri === null) return
//     await uploadAvatar({ multipart: { avatar: await fileFromUri(uri, { name: 'avatar.jpg' }), caption: caption() } })
//
// Web: the picker's own `File` (its real name and type) when the URI came from a picker, else the bytes read through
// `fetch` (any `blob:` / `data:` / same-origin URL). Native (PMTC): a `PyreonUploadFile` naming the file, which the
// request STREAMS from disk when it is sent — a large video is never read into memory.

import { pickedFileFor } from './file-picker'

export interface FileFromUriOptions {
  /** The filename to send. Defaults to the file's own name (the URI's last path segment natively). */
  name?: string | undefined
  /** The MIME type to send. Defaults to the file's own type ('' when unknown, as on the web). */
  type?: string | undefined
}

/** The last path segment of `uri`, percent-decoded — the default filename when nothing better is known. */
function lastSegment(uri: string): string {
  if (uri.startsWith('data:') || uri.startsWith('blob:')) return 'blob'
  const path = uri.split(/[?#]/)[0] ?? uri
  const segment = path.slice(path.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(segment) || 'blob'
  } catch {
    return segment || 'blob'
  }
}

/**
 * Resolve a picker / camera URI to an uploadable `File`.
 *
 * Pass `name` (and `type`) when the filename matters to the server: a native picker hands back a temporary copy whose
 * name is not always the original's, so naming it explicitly is what makes every platform send the same part.
 *
 * Rejects when the URI cannot be read.
 *
 * @example
 * ```ts
 * const uri = await files.pick(['application/pdf'])
 * if (uri !== null) await upload({ multipart: { file: await fileFromUri(uri), note: note() } })
 * ```
 */
export async function fileFromUri(uri: string, options: FileFromUriOptions = {}): Promise<File> {
  const picked = pickedFileFor(uri)
  if (picked !== undefined && options.name === undefined && options.type === undefined) return picked
  const blob: Blob = picked ?? (await (await fetch(uri)).blob())
  return new File([blob], options.name ?? picked?.name ?? lastSegment(uri), { type: options.type ?? blob.type })
}
