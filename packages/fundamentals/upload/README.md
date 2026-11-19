# @pyreon/upload

> **Status: Experimental.** Outside the semver promise: the API may change in a minor release. See the [stability policy](https://pyreon.dev/docs/stability-and-direction).

File selection, validation, preview and upload with progress as signals. A reactive queue with concurrency, retry for the failures a retry can fix, pause, resume and cancel; transports for XHR (real upload progress), chunked parts, S3 presigned multipart and tus; resume state that survives a page reload; headless drop zone and picker components; form and query adapters.

> Client-side validation is user experience: the server must check type, size and content itself.

## Install

```bash
bun add @pyreon/upload @pyreon/reactivity
# for the components: @pyreon/core
```

| Entry | What |
| --- | --- |
| `@pyreon/upload/core` | validation, `sniffType`, chunk planning, progress math, error taxonomy, resume store; no dependencies |
| `@pyreon/upload` | the core plus `createUploader`, `useUploader`, `useFilePicker`, `useFileDrop` |
| `@pyreon/upload/transport-xhr`, `-chunked`, `-s3`, `-tus` | one transport each; none imports another |
| `@pyreon/upload/components` | headless `<FileDrop>` and `<FilePicker>` |
| `@pyreon/upload/form`, `@pyreon/upload/query` | adapters for `@pyreon/form` and `@pyreon/query` |

## Quick start

```tsx
import { createUploader } from '@pyreon/upload'
import { FileDrop } from '@pyreon/upload/components'
import { xhrTransport } from '@pyreon/upload/transport-xhr'

const uploader = createUploader({
  transport: xhrTransport({ url: '/api/upload' }),
  rules: { maxSize: '10 MB', accept: ['image/*'] },
})

export const Zone = () => (
  <FileDrop label="Drop images here or press Enter" onFiles={(files) => uploader.add(files)}>
    Drop images here or press Enter
  </FileDrop>
)
// per file: file.status(), file.progress(), file.error(), file.preview() are signals
```

Things worth knowing:

- Progress never goes backwards and is written to signals once per animation frame.
- Only failures a retry can fix are retried (network, timeouts, 408, 425, 429 with `Retry-After`, 5xx); never another 4xx.
- `dispose()` aborts requests and removes timers, listeners and object URLs; creating anything on the server is inert.
- The drop zone is a labelled `role="button"` (Enter and Space open the dialog), refusals are announced in a live region with their reasons, and focus returns to the zone.

Full guide with recipes, the chunked server contract and reference handlers, the security notes and a "coming from" table: [docs/upload](https://pyreon.dev/docs/upload).
