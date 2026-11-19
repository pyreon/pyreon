import type { Uploader, UploadFile } from './uploader'
import type { UploadError } from './types'

/** The failure of an upload as a mutation error: carries the typed `UploadError` and the file. */
export interface UploadMutationError extends Error {
  uploadError: UploadError
  file: UploadFile
}

/**
 * An upload as an `@pyreon/query` mutation. `mutationFn` takes the files, adds them to the uploader and resolves with their
 * `UploadFile`s when every one is done; it rejects with an `UploadMutationError` for the first file that fails or is rejected,
 * so `useMutation` reports `isPending`, `isSuccess` and `isError` for the batch. Progress is not part of a mutation's state:
 * read it from the uploader (`uploader.progress()`, or each file's `progress()`), which is a signal.
 *
 * ```ts
 * const uploader = createUploader({ transport })
 * const m = useMutation(uploadMutation(uploader))
 * m.mutate(files)
 * ```
 *
 * @example typeof uploadMutation({ add: () => [] } as never).mutationFn // => 'function'
 */
export function uploadMutation(uploader: Uploader): { mutationFn: (files: readonly (File | Blob)[]) => Promise<UploadFile[]> } {
  return {
    mutationFn: (files) =>
      new Promise((resolve, reject) => {
        const added = uploader.add([...files])

        if (added.length === 0) return resolve([])
        const check = (): void => {
          const failed = added.find((f) => f.status() === 'failed' || f.status() === 'rejected' || f.status() === 'cancelled')

          if (failed !== undefined) {
            const error = failed.error()
            const e = Object.assign(new Error(error?.message ?? 'The upload failed.'), { uploadError: error ?? { kind: 'aborted' as const, message: 'The upload was cancelled.', retryable: false }, file: failed })

            return reject(e)
          }
          if (added.every((f) => f.status() === 'done')) resolve(added)
          else setTimeout(check, 50)
        }

        check()
      }),
  }
}
