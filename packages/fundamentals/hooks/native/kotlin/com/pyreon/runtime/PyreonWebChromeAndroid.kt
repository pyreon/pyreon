// PyreonWebChromeAndroid — the browser chrome a page hosted in PyreonWebView
// relies on (#3982). Mirror of the iOS host's WKUIDelegate.
//
// An Android WebView with no WebChromeClient silently does nothing for:
//   - `<input type="file">`   — `onShowFileChooser` is never answered, so no
//                               picker opens (and an unanswered callback leaves
//                               the input dead until the view is recreated);
//   - `navigator.geolocation` — `onGeolocationPermissionsShowPrompt` is never
//                               answered, so the request fails or hangs;
//   - `alert` / `confirm` / `prompt` — no UI; `confirm()` returns false;
//   - `getUserMedia`          — `onPermissionRequest` is denied;
//   - fullscreen video        — `onShowCustomView` is ignored.
//
// What each one does here, and why:
//
// FILE INPUT. The page's `accept` / `multiple` / `capture` go through
// `pyreonFileChooserPlan` (PyreonWebChromePolicy.kt, unit-tested). The picker is
// the Storage Access Framework (`ACTION_OPEN_DOCUMENT`), which takes SEVERAL MIME
// types at once, unlike `GetContent`. `capture` opens the camera when every
// accepted type is image (or video); the camera writes into a `FileProvider`
// URI, so the app must declare the provider (`${applicationId}.pyreon.fileprovider`
// — the create-multiplatform scaffold does). Without it, or with no camera app,
// the page gets the picker instead, which is what Chrome does too. If the app
// declares CAMERA, the platform refuses `ACTION_IMAGE_CAPTURE` until it is
// granted, so it is requested first.
//
// PERMISSIONS (location, camera, microphone). A hosted page is a website. Like
// a browser, the host asks the USER per origin ("example.com wants to use your
// location") before handing over a capability the APP may already hold for its
// own features — the app having location permission must not silently mean
// every page it hosts has it too. WebKit does the same on iOS. After consent,
// the runtime permission is requested if it has not been granted; a permission
// the app does not DECLARE in AndroidManifest.xml is never requested (the
// system would refuse it) and is logged instead, naming the entry to add.
//
// JS DIALOGS are AlertDialogs titled with the page's host, as on iOS.
//
// WINDOWS. `window.open` and `target="_blank"` hand an http(s) / mailto / tel /
// sms URL to the SYSTEM rather than replacing the hosted page — the same policy
// as the iOS host (`pyreonMayOpenExternally`). Only a user gesture can open one.
//
// CONSOLE. Not overridden: the default WebChromeClient already logs a page's
// `console.*` to logcat (tag `chromium`, `[INFO:CONSOLE(n)]`), which is where an
// Android developer looks. Overriding `onConsoleMessage` would only move it.
//
// Every WebView callback here is answered EXACTLY once — on success, denial,
// dismissal, and when the view is released while one is pending.

package com.pyreon.runtime

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Message
import android.provider.MediaStore
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.MimeTypeMap
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import androidx.activity.compose.LocalActivityResultRegistryOwner
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File

private const val TAG = "PyreonWebView"

/** The FileProvider authority a `capture` file input writes through. */
internal fun pyreonWebViewFileProviderAuthority(context: Context): String =
    "${context.packageName}.pyreon.fileprovider"

/**
 * One hosted page's chrome state. Created per PyreonWebView (it holds that
 * view's pending callbacks), with the Activity Result launchers registered at
 * composition — the only place the Activity Result API allows it.
 */
internal class PyreonWebChrome(private val context: Context) {
    var fileLauncher: ActivityResultLauncher<Intent>? = null
    var permissionLauncher: ActivityResultLauncher<Array<String>>? = null

    private val files = PyreonOnceSlot<Array<Uri>>()
    /** The camera's output, while a capture is in flight (deleted if cancelled). */
    private var captureFile: File? = null
    private var captureUri: Uri? = null

    val permissions: PyreonPermissionQueue = PyreonPermissionQueue { perms ->
        val launcher = permissionLauncher
        if (launcher == null) {
            deliverPermissions(perms.associateWith { false })
        } else {
            try {
                launcher.launch(perms.toTypedArray())
            } catch (e: IllegalStateException) {
                deliverPermissions(perms.associateWith { false })
            }
        }
    }

    private var openDialog: AlertDialog? = null
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    fun deliverPermissions(result: Map<String, Boolean>) {
        permissions.deliver(result)
    }

    // ---- permissions ---------------------------------------------------------

    private val declared: Set<String> by lazy {
        try {
            @Suppress("DEPRECATION")
            context.packageManager
                .getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
                .requestedPermissions?.toSet() ?: emptySet()
        } catch (e: PackageManager.NameNotFoundException) {
            emptySet()
        }
    }

    private fun granted(permission: String): Boolean =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    /**
     * Ask for the declared subset of [wanted] that is not yet granted, then
     * report every one of [wanted] that ends up granted.
     */
    private fun ensure(wanted: List<String>, onResult: (Set<String>) -> Unit) {
        val usable = wanted.filter { it in declared }
        val missing = usable.filterNot(::granted)
        permissions.request(missing) { newlyGranted ->
            onResult(usable.filter { granted(it) || it in newlyGranted }.toSet())
        }
    }

    private fun warnUndeclared(feature: String, entries: List<String>) {
        Log.w(
            TAG,
            "[Pyreon] <WebView>: a hosted page asked for $feature, but AndroidManifest.xml declares none of " +
                entries.joinToString() + " — add <uses-permission android:name=\"${entries.first()}\" /> " +
                "to let it ask. Denied.",
        )
    }

    /** "<host> wants to use <what>." — Allow / Don't allow, answered once. */
    private fun consent(origin: String?, what: String, onAnswer: (Boolean) -> Unit) {
        val activity = context.findActivity()
        if (activity == null || activity.isFinishing) {
            onAnswer(false)
            return
        }
        dismissDialog()
        var answered = false
        val answer = { ok: Boolean -> if (!answered) { answered = true; onAnswer(ok) } }
        val host = pyreonOriginHost(origin) ?: "This page"
        openDialog = AlertDialog.Builder(activity)
            .setMessage("$host wants to use $what.")
            .setPositiveButton("Allow") { _, _ -> answer(true) }
            .setNegativeButton("Don't allow") { _, _ -> answer(false) }
            .setOnCancelListener { answer(false) }
            .setOnDismissListener { answer(false) }
            .show()
    }

    fun geolocation(origin: String, callback: GeolocationPermissions.Callback) {
        if (PYREON_LOCATION_PERMISSIONS.none { it in declared }) {
            warnUndeclared("the device location", PYREON_LOCATION_PERMISSIONS)
            callback.invoke(origin, false, false)
            return
        }
        consent(origin, "your location") { allowed ->
            if (!allowed) {
                callback.invoke(origin, false, false)
            } else {
                ensure(PYREON_LOCATION_PERMISSIONS) { g -> callback.invoke(origin, g.isNotEmpty(), false) }
            }
        }
    }

    fun hideGeolocationPrompt() = dismissDialog()

    fun mediaPermission(request: PermissionRequest) {
        val resources = request.resources.toList()
        val needed = resources.mapNotNull(::pyreonPermissionForResource).distinct()
        if (needed.isEmpty()) {
            request.deny()
            return
        }
        if (needed.none { it in declared }) {
            warnUndeclared(pyreonDescribeResources(resources), needed)
            request.deny()
            return
        }
        consent(request.origin?.toString(), pyreonDescribeResources(resources)) { allowed ->
            if (!allowed) {
                request.deny()
            } else {
                ensure(needed) { g ->
                    val grant = pyreonGrantableResources(resources, g)
                    if (grant.isEmpty()) request.deny() else request.grant(grant.toTypedArray())
                }
            }
        }
    }

    // ---- file input ----------------------------------------------------------

    fun showFileChooser(
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams,
    ): Boolean {
        if (fileLauncher == null) {
            // No ActivityResultRegistryOwner (a host that is not a
            // ComponentActivity): returning false lets WebView treat the
            // request as unhandled, and the callback must then NOT be used.
            Log.w(TAG, "[Pyreon] <WebView>: file input needs a ComponentActivity host; the picker is unavailable.")
            return false
        }
        files.hold { uris -> callback.onReceiveValue(uris) }
        val plan = pyreonFileChooserPlan(
            params.acceptTypes?.toList() ?: emptyList(),
            params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE,
            params.isCaptureEnabled,
        ) { ext -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) }
        val capture = plan.capture
        if (capture != null && PYREON_PERMISSION_CAMERA in declared && !granted(PYREON_PERMISSION_CAMERA)) {
            // Declaring CAMERA makes ACTION_IMAGE_CAPTURE require it.
            ensure(listOf(PYREON_PERMISSION_CAMERA)) { g ->
                if (PYREON_PERMISSION_CAMERA in g) launchCaptureOrPicker(plan, capture) else launchPicker(plan)
            }
        } else if (capture != null) {
            launchCaptureOrPicker(plan, capture)
        } else {
            launchPicker(plan)
        }
        return true
    }

    private fun launchPicker(plan: PyreonFileChooserPlan) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = plan.mimeTypes.singleOrNull() ?: "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, plan.mimeTypes.toTypedArray())
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, plan.multiple)
        }
        launch(intent)
    }

    private fun launchCaptureOrPicker(plan: PyreonFileChooserPlan, kind: PyreonCaptureKind) {
        val authority = pyreonWebViewFileProviderAuthority(context)
        if (context.packageManager.resolveContentProvider(authority, 0) == null) {
            Log.w(
                TAG,
                "[Pyreon] <WebView>: a capture file input needs the FileProvider \"$authority\" declared in " +
                    "AndroidManifest.xml (the create-multiplatform scaffold declares it); showing the picker instead.",
            )
            launchPicker(plan)
            return
        }
        val dir = File(context.cacheDir, "pyreon-webview").apply { mkdirs() }
        val file = File(dir, "capture-${System.currentTimeMillis()}" + if (kind == PyreonCaptureKind.IMAGE) ".jpg" else ".mp4")
        val uri = FileProvider.getUriForFile(context, authority, file)
        val intent = Intent(
            if (kind == PyreonCaptureKind.IMAGE) MediaStore.ACTION_IMAGE_CAPTURE else MediaStore.ACTION_VIDEO_CAPTURE,
        ).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        captureFile = file
        captureUri = uri
        launch(intent, onMissing = { clearCapture(deleteFile = true); launchPicker(plan) })
    }

    /** Launch [intent]; returns false (after [onMissing]) when nothing can handle it. */
    private fun launch(intent: Intent, onMissing: () -> Unit = { files.cancel() }): Boolean {
        return try {
            fileLauncher!!.launch(intent)
            true
        } catch (e: ActivityNotFoundException) {
            onMissing()
            false
        }
    }

    fun onFileResult(resultCode: Int, data: Intent?) {
        val uri = captureUri
        if (uri != null) {
            val ok = resultCode == Activity.RESULT_OK && (captureFile?.length() ?: 0L) > 0L
            clearCapture(deleteFile = !ok)
            files.deliver(if (ok) arrayOf(uri) else null)
            return
        }
        if (resultCode != Activity.RESULT_OK || data == null) {
            files.cancel()
            return
        }
        val clip = data.clipData
        val uris = if (clip != null) {
            Array(clip.itemCount) { clip.getItemAt(it).uri }
        } else {
            data.data?.let { arrayOf(it) }
        }
        files.deliver(uris)
    }

    private fun clearCapture(deleteFile: Boolean) {
        if (deleteFile) captureFile?.delete()
        captureFile = null
        captureUri = null
    }

    // ---- JS dialogs ----------------------------------------------------------

    enum class DialogKind { ALERT, CONFIRM, PROMPT }

    /**
     * An `alert` / `confirm` / `prompt`. Returns false (WebView's default: no
     * UI) only when there is no Activity to show it on. Dismissing an alert
     * acknowledges it; dismissing a confirm / prompt is Cancel.
     */
    fun jsDialog(kind: DialogKind, url: String?, message: String?, defaultValue: String?, result: JsResult): Boolean {
        val activity = context.findActivity() ?: return false
        if (activity.isFinishing) return false
        dismissDialog()
        var answered = false
        val field = if (kind == DialogKind.PROMPT) EditText(activity).apply { setText(defaultValue ?: "") } else null
        val ok = {
            if (!answered) {
                answered = true
                if (result is JsPromptResult) result.confirm(field?.text?.toString() ?: "") else result.confirm()
            }
        }
        val cancel = {
            if (!answered) {
                answered = true
                result.cancel()
            }
        }
        val builder = AlertDialog.Builder(activity).setMessage(message ?: "")
        pyreonOriginHost(url)?.let { builder.setTitle(it) }
        if (field != null) builder.setView(field)
        builder.setPositiveButton(android.R.string.ok) { _, _ -> ok() }
        if (kind != DialogKind.ALERT) builder.setNegativeButton(android.R.string.cancel) { _, _ -> cancel() }
        val dismissed = { if (kind == DialogKind.ALERT) ok() else cancel() }
        builder.setOnCancelListener { dismissed() }
        builder.setOnDismissListener { dismissed() }
        openDialog = builder.show()
        return true
    }

    private fun dismissDialog() {
        val d = openDialog ?: return
        openDialog = null
        if (d.isShowing) d.dismiss()
    }

    // ---- windows -------------------------------------------------------------

    fun openWindow(view: WebView, isUserGesture: Boolean, resultMsg: Message): Boolean {
        if (!isUserGesture) return false
        val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
        // A throwaway view only to learn the URL the page is opening — WebView
        // does not pass it to onCreateWindow. It is never attached or shown.
        val sink = WebView(view.context)
        var handled = false
        val handle = { url: String? ->
            if (!handled && url != null && url != "about:blank") {
                handled = true
                openExternally(url)
                sink.post { sink.destroy() }
            }
        }
        sink.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                handle(request.url.toString())
                return true
            }

            override fun onPageStarted(v: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                handle(url)
                v.stopLoading()
            }
        }
        transport.webView = sink
        resultMsg.sendToTarget()
        return true
    }

    private fun openExternally(url: String) {
        if (!pyreonMayOpenExternally(url)) {
            Log.w(TAG, "[Pyreon] <WebView>: refused to open \"$url\" outside the view (only http(s)/mailto/tel/sms are handed to the system).")
            return
        }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        if (context.findActivity() == null) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "[Pyreon] <WebView>: no app can open \"$url\".")
        }
    }

    // ---- fullscreen video ----------------------------------------------------

    fun showCustomView(view: View, callback: WebChromeClient.CustomViewCallback) {
        val decor = context.findActivity()?.window?.decorView as? ViewGroup
        if (decor == null) {
            callback.onCustomViewHidden()
            return
        }
        hideCustomView()
        decor.addView(
            view,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        customView = view
        customViewCallback = callback
    }

    fun hideCustomView() {
        val view = customView ?: return
        (view.parent as? ViewGroup)?.removeView(view)
        customView = null
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
    }

    /** The view is going away: answer everything still pending. */
    fun release() {
        files.cancel()
        clearCapture(deleteFile = true)
        permissions.cancelAll()
        dismissDialog()
        hideCustomView()
    }
}

/** The WebChromeClient that routes every callback to [chrome]. */
internal class PyreonWebChromeClient(private val chrome: PyreonWebChrome) : WebChromeClient() {
    override fun onShowFileChooser(
        webView: WebView,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: FileChooserParams,
    ): Boolean = chrome.showFileChooser(filePathCallback, fileChooserParams)

    override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) =
        chrome.geolocation(origin, callback)

    override fun onGeolocationPermissionsHidePrompt() = chrome.hideGeolocationPrompt()

    override fun onPermissionRequest(request: PermissionRequest) = chrome.mediaPermission(request)

    override fun onJsAlert(view: WebView, url: String?, message: String?, result: JsResult): Boolean =
        chrome.jsDialog(PyreonWebChrome.DialogKind.ALERT, url, message, null, result)

    override fun onJsConfirm(view: WebView, url: String?, message: String?, result: JsResult): Boolean =
        chrome.jsDialog(PyreonWebChrome.DialogKind.CONFIRM, url, message, null, result)

    override fun onJsPrompt(
        view: WebView,
        url: String?,
        message: String?,
        defaultValue: String?,
        result: JsPromptResult,
    ): Boolean = chrome.jsDialog(PyreonWebChrome.DialogKind.PROMPT, url, message, defaultValue, result)

    override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean =
        chrome.openWindow(view, isUserGesture, resultMsg)

    override fun onShowCustomView(view: View, callback: CustomViewCallback) = chrome.showCustomView(view, callback)

    override fun onHideCustomView() = chrome.hideCustomView()
}

/**
 * The chrome for one PyreonWebView, with its Activity Result launchers. The
 * launchers exist only under an ActivityResultRegistryOwner (a
 * ComponentActivity — the scaffold's MainActivity, and every Compose test
 * host); without one the file input and runtime permission requests degrade
 * to "unavailable" instead of crashing the composition.
 */
@Composable
internal fun rememberPyreonWebChrome(): PyreonWebChrome {
    val context = LocalContext.current
    val chrome = remember(context) { PyreonWebChrome(context) }
    if (LocalActivityResultRegistryOwner.current != null) {
        val files = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
            chrome.onFileResult(r.resultCode, r.data)
        }
        val perms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
            chrome.deliverPermissions(r)
        }
        SideEffect {
            chrome.fileLauncher = files
            chrome.permissionLauncher = perms
        }
    }
    return chrome
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
