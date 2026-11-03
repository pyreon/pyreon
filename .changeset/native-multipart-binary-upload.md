---
'@pyreon/native-compiler': minor
'@pyreon/http': minor
'@pyreon/hooks': minor
'@pyreon/query': patch
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Native apps can upload picked images and files (#3979).

- New `fileFromUri(uri, { name, type })` in `@pyreon/hooks` turns the URI a picker or the camera returned into a file a request can send. On the web it returns the picker's own `File`, with its real name and type, or reads the URI through `fetch`. On iOS and Android it becomes a `PyreonUploadFile`. Android reads `content://` URIs through the app's `ContentResolver`. The file is streamed from disk when the request is sent, so a large video is never held in memory.
- An endpoint call's `multipart` body lowers to the new `PyreonMultipartBody`. Parts keep source order. A struct value is sent as a `JSON.stringify` text part, and an array sends one part per element. Names, filenames and text values are normalized and escaped the way `FormData` does it. An executed test checks the runtime writer byte for byte against the web's `FormData` on both targets.
- `body: file` sends the file's bytes as the whole body, typed by the file. A string `body` is a text body.
- A `form` body is encoded by the web's own `encodeForm` at compile time when every value is a literal. When a value is only known at runtime, `PyreonURL.query` encodes it when the request is sent.
- A `data:` URI is decoded the way `fetch` decodes it: percent escapes become raw bytes, `;base64` matches in any case, and a URI with no type defaults to `text/plain;charset=US-ASCII`.
- Named warnings: an unawaited `fileFromUri`, two body encodings in one call, a runtime array of objects in `multipart`, and a nested object in `form`.
- `useImagePicker().pick()`, `useFilePicker().pick()` and `useCamera().capture()` are now typed as `String?` natively. `if (uri === null) return` therefore narrows the URI for the code after it on iOS. Before, every later read was an optional and failed to compile.
- Fixed: an early `return` inside an event handler did not compile on Android. Kotlin forbids a bare `return` in a lambda. An async handler now emits `return@launch`, and a plain handler is labelled.
- Fixed: on iOS, a value of a type declared at file scope, such as `interface Meta { … }`, was not recognized as a struct inside a request. iOS and Android could therefore encode the same field differently.
