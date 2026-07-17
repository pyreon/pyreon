// PyreonImagePicker — the Compose side of Pyreon's photo-picker service
// (M3.4). Mirrors the Swift `PyreonImagePicker` one-for-one + the core
// `@pyreon/hooks` `useImagePicker` shape.
//
// Surface:
//
//     val uri = picker.pick()   // "content://…" or null when cancelled
//
// `pick()` is a `suspend` fun — the second Pyreon service with an async RESULT
// (after PyreonBiometrics). PMTC lowers `const uri = await picker.pick()`
// inside an `async` handler to `pyreonAsyncScope.launch { val uri =
// picker.pick() }` (the M4.5 lowering; Kotlin suspend calls carry no `await`).
//
// NO photo-library permission is required: the Android Photo Picker
// (`PickVisualMedia`) runs OUT OF PROCESS and hands back only the single asset
// the user picked — the same policy-safe property as iOS's PHPickerViewController.
//
// THE iOS/ANDROID ASYMMETRY this class exists to absorb: iOS presents its picker
// from the key window, so `PyreonImagePicker.swift` is self-contained. Android
// delivers the result through an ActivityResult CALLBACK whose registration must
// happen at composition time (`rememberLauncherForActivityResult` is a
// @Composable; registering once the host is RESUMED throws). So the emit wires a
// composable-scope launcher into `launcher`, and this class bridges
// callback→suspend via a CompletableDeferred — which is what lets `pick()` keep
// the exact same `suspend fun (): String?` shape as Swift's `async`.
//
// Deps: kotlinx-coroutines + androidx.activity (both already present in every
// Android example that compiles this srcDir — the srcDir compiles ALL runtime
// sources into each app, so a new dep here would be a dep for all of them).
//
// Threading: `pending` is touched from `pick()` (a coroutine started by
// `rememberCoroutineScope()`, whose context is Main) and from `onResult` (an
// ActivityResult callback, also Main), so both touches are main-thread-confined
// and need no synchronisation.

package com.pyreon.runtime

import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.CompletableDeferred

class PyreonImagePicker {
    /**
     * The composable-scope ActivityResult launcher, assigned by the PMTC emit
     * (`picker.launcher = rememberLauncherForActivityResult(…) { … }`). Null
     * until composition wires it — `pick()` then resolves null rather than
     * throwing, so a caller's `await` can never hang.
     */
    var launcher: ActivityResultLauncher<PickVisualMediaRequest>? = null

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
     * Present the system photo picker and return the picked image's
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
        activeLauncher.launch(
            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
        )
        return deferred.await()
    }
}
