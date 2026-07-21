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
// `Array<String>` of MIME types (vs `PickVisualMediaRequest`). `pick()` passes
// `arrayOf("*/*")` — accept any document; a typed filter is a follow-up.
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
     */
    suspend fun pick(): String? {
        val activeLauncher = launcher ?: return null
        // A second pick() while one is still in flight: settle the older one as
        // cancelled so its caller's await can never hang forever (only one
        // ActivityResult will come back, and it belongs to the newer launch).
        pending?.complete(null)
        val deferred = CompletableDeferred<String?>()
        pending = deferred
        // "*/*" — accept any document type. A typed filter is a follow-up.
        activeLauncher.launch(arrayOf("*/*"))
        return deferred.await()
    }
}
