// PyreonFilePicker — the Compose side of Pyreon's document-picker service
// (M3.8). Mirrors the Swift `PyreonFilePicker` one-for-one + the core
// `@pyreon/hooks` `useFilePicker` shape. The document sibling of
// PyreonImagePicker (any file, not just photos).
//
// Surface:
//
//     val uri = files.pick()   // "content://…" or null when cancelled
//
// `pick()` is a `suspend` fun — the third Pyreon service with an async RESULT
// (after PyreonBiometrics and PyreonImagePicker). PMTC lowers `const uri = await
// files.pick()` inside an `async` handler to `pyreonAsyncScope.launch { val uri
// = files.pick() }` (the M4.5 lowering; Kotlin suspend calls carry no `await`).
//
// NO storage permission is required: the Storage Access Framework
// (`OpenDocument`) runs OUT OF PROCESS and hands back only the single document
// the user picked — the same policy-safe property as iOS's
// UIDocumentPickerViewController.
//
// THE iOS/ANDROID ASYMMETRY this class absorbs (identical to PyreonImagePicker):
// iOS presents from the key window, so `PyreonFilePicker.swift` is
// self-contained. Android delivers the result through an ActivityResult CALLBACK
// whose registration must happen at composition time
// (`rememberLauncherForActivityResult` is a @Composable; registering once the
// host is RESUMED throws). So the emit wires a composable-scope launcher into
// `launcher`, and this class bridges callback→suspend via a CompletableDeferred
// — which lets `pick()` keep the exact `suspend fun (): String?` shape as
// Swift's `async`.
//
// The one delta from the image picker: `OpenDocument`'s launcher input is an
// `Array<String>` of MIME types (vs `PickVisualMediaRequest`). `pick(accept)`
// takes the web `<input accept>` vocabulary — MIME types (`application/pdf`),
// wildcards (`image/*`) and extensions (`.csv`) — and `mimeTypesFor` turns it
// into that array. No filter means any document (`*/*`).
//
// Deps: kotlinx-coroutines + androidx.activity (both already present in every
// Android example that compiles this srcDir).
//
// Threading: `pending` is touched from `pick()` (a coroutine started by
// `rememberCoroutineScope()`, whose context is Main) and from `onResult` (an
// ActivityResult callback, also Main), so both touches are main-thread-confined
// and need no synchronisation.

package com.pyreon.runtime

import androidx.activity.result.ActivityResultLauncher
import kotlinx.coroutines.CompletableDeferred

class PyreonFilePicker {

    /**
     * Whether a picker is available. Always `true`, matching iOS and the
     * documented shared contract ("Native: always true" — `pick()` collapses an
     * unavailable picker to null rather than failing).
     *
     * Returning `launcher != null` was considered and REJECTED: it is arguably
     * truer on Android, where the launcher is null until composition wires it,
     * but it would make the same call return different answers on iOS and
     * Android for the same source — a new cross-target divergence, which is the
     * class of bug this method exists to close. The launcher case is already
     * handled: `pick()` resolves null when it is unwired.
     *
     * Present because the shared `useImagePicker()` / `useFilePicker()` surface
     * declares `isAvailable: () => boolean` and always has. It was documented
     * and never implemented, so `if (picker.isAvailable())` — an ordinary
     * defensive guard, valid TypeScript on web — failed BOTH native targets
     * with no warning.
     */
    fun isAvailable(): Boolean = true
    /**
     * The composable-scope ActivityResult launcher, assigned by the PMTC emit
     * (`files.launcher = rememberLauncherForActivityResult(OpenDocument()) { … }`).
     * Its input is the `Array<String>` of acceptable MIME types the SAF
     * `OpenDocument` contract takes. Null until composition wires it — `pick()`
     * then resolves null rather than throwing, so a caller's `await` can never
     * hang.
     */
    var launcher: ActivityResultLauncher<Array<String>>? = null

    private var pending: CompletableDeferred<String?>? = null

    /**
     * Deliver an ActivityResult back to the suspended `pick()`. Called by the
     * emit-wired launcher callback with the picked `Uri.toString()`, or null
     * when the user cancelled.
     */
    fun onResult(uri: String?) {
        val deferred = pending
        pending = null
        deferred?.complete(uri)
    }

    /**
     * Present the system document picker and return the picked file's
     * `content://` URI, or null if the user cancelled (or no launcher is
     * wired). Never throws.
     *
     * `accept` limits the selectable files, in the web `<input accept>`
     * vocabulary (see [mimeTypesFor]); empty means any document.
     */
    suspend fun pick(accept: List<String> = emptyList()): String? {
        val activeLauncher = launcher ?: return null
        // A second pick() while one is still in flight: settle the older one as
        // cancelled so its caller's await can never hang forever (only one
        // ActivityResult will come back, and it belongs to the newer launch).
        pending?.complete(null)
        val deferred = CompletableDeferred<String?>()
        pending = deferred
        activeLauncher.launch(mimeTypesFor(accept))
        return deferred.await()
    }

    companion object {
        // Extensions the document providers report under a MIME type. Android's
        // own MimeTypeMap needs the SDK, and this file compiles without it; an
        // extension missing here widens to any document rather than hiding the
        // file the user is looking for.
        private val EXTENSION_MIME: Map<String, List<String>> = mapOf(
            "pdf" to listOf("application/pdf"),
            "csv" to listOf("text/csv", "text/comma-separated-values"),
            "txt" to listOf("text/plain"),
            "md" to listOf("text/markdown"),
            "json" to listOf("application/json"),
            "xml" to listOf("application/xml", "text/xml"),
            "html" to listOf("text/html"),
            "zip" to listOf("application/zip"),
            "png" to listOf("image/png"),
            "jpg" to listOf("image/jpeg"),
            "jpeg" to listOf("image/jpeg"),
            "gif" to listOf("image/gif"),
            "webp" to listOf("image/webp"),
            "heic" to listOf("image/heic"),
            "svg" to listOf("image/svg+xml"),
            "mp3" to listOf("audio/mpeg"),
            "wav" to listOf("audio/wav", "audio/x-wav"),
            "mp4" to listOf("video/mp4"),
            "mov" to listOf("video/quicktime"),
            "doc" to listOf("application/msword"),
            "docx" to listOf("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            "xls" to listOf("application/vnd.ms-excel"),
            "xlsx" to listOf("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "ppt" to listOf("application/vnd.ms-powerpoint"),
            "pptx" to listOf("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        )

        /**
         * The `OpenDocument` MIME array for a web-style `accept` list:
         * MIME types and wildcards pass through, `.ext` maps via a table.
         * Anything unrecognised — or an empty list — widens to any document: a filter
         * that is too broad shows extra files, one that is too narrow hides the
         * file the user wants.
         */
        internal fun mimeTypesFor(accept: List<String>): Array<String> {
            val out = LinkedHashSet<String>()
            for (raw in accept) {
                val entry = raw.trim().lowercase()
                when {
                    entry.isEmpty() -> continue
                    entry.startsWith(".") -> {
                        val mapped = EXTENSION_MIME[entry.substring(1)] ?: return arrayOf("*/*")
                        out.addAll(mapped)
                    }
                    entry.contains('/') -> out.add(entry)
                    else -> return arrayOf("*/*")
                }
            }
            return if (out.isEmpty()) arrayOf("*/*") else out.toTypedArray()
        }
    }
}
