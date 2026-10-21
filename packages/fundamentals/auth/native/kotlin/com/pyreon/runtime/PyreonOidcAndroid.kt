package com.pyreon.runtime

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

// The Android edge of native sign-in: the browser and the redirect. Real-SDK surface, so this
// file is outside the stub gate (`kotlinSdkOnly`) and verified by the device build.
//
// The design is AppAuth's, the reference Android OAuth library:
//   - PyreonAuthActivity (not exported) opens the authorization URL in a browser tab and
//     waits. If it RESUMES without a redirect having arrived, the user came back without
//     finishing (back button, closed tab) — that is a cancellation, reported at once instead
//     of leaving sign-in hanging for the flow's ten minutes.
//   - PyreonAuthRedirectActivity (exported, on the redirect scheme) receives the provider's
//     redirect and hands it to PyreonAuthActivity, which completes the waiting sign-in.
//
// The host app declares both in AndroidManifest.xml (sources are wired, not an AAR, so there
// is no manifest to merge from):
//
//   <activity android:name="com.pyreon.runtime.PyreonAuthActivity" android:exported="false"
//       android:launchMode="singleTask" android:theme="@android:style/Theme.Translucent.NoTitleBar" />
//   <activity android:name="com.pyreon.runtime.PyreonAuthRedirectActivity" android:exported="true">
//     <intent-filter>
//       <action android:name="android.intent.action.VIEW" />
//       <category android:name="android.intent.category.DEFAULT" />
//       <category android:name="android.intent.category.BROWSABLE" />
//       <data android:scheme="com.example.app" />   <!-- your redirectUri's scheme -->
//     </intent-filter>
//   </activity>

/** The one sign-in in flight. One at a time: a new attempt supersedes the last. */
internal object PyreonAuthPending {
    @Volatile var result: CompletableFuture<String>? = null
}

/** A browser for sign-in: a Custom Tab when the browser supports it, the default browser otherwise. */
public class PyreonActivityAuthBrowser(context: Context) : PyreonAuthBrowser {
    private val app = context.applicationContext

    override fun authorize(url: String, redirectUri: String): String {
        val pending = CompletableFuture<String>()
        PyreonAuthPending.result?.completeExceptionally(PyreonAuthCancelled())
        PyreonAuthPending.result = pending
        app.startActivity(
            Intent(app, PyreonAuthActivity::class.java)
                .putExtra(PyreonAuthActivity.EXTRA_URL, url)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        return try {
            pending.get(PyreonAuthCore.FLOW_TTL_MS, TimeUnit.MILLISECONDS)
        } catch (e: ExecutionException) {
            throw e.cause ?: PyreonAuthCancelled()
        } catch (_: TimeoutException) {
            throw PyreonAuthCancelled()
        } finally {
            if (PyreonAuthPending.result === pending) PyreonAuthPending.result = null
        }
    }
}

public class PyreonAuthActivity : Activity() {
    private var launched = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        launched = savedInstanceState?.getBoolean(STATE_LAUNCHED) ?: false
    }

    override fun onResume() {
        super.onResume()
        if (!launched) {
            launched = true
            val url = intent.getStringExtra(EXTRA_URL)
            if (url == null) return finishWith(null)
            val view = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            // The Custom Tabs protocol is an extra on an ordinary VIEW intent, so no
            // androidx.browser dependency: a supporting browser opens a tab, any other opens normally.
            view.putExtras(Bundle().apply { putBinder("android.support.customtabs.extra.SESSION", null) })
            try {
                startActivity(view)
            } catch (_: android.content.ActivityNotFoundException) {
                PyreonAuthPending.result?.completeExceptionally(PyreonAuthError("no_browser", "no browser is installed"))
                finish()
            }
            return
        }
        // Resumed again WITHOUT the redirect: the user came back without finishing.
        finishWith(null)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        finishWith(intent.data?.toString())
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(STATE_LAUNCHED, launched)
    }

    private fun finishWith(redirect: String?) {
        val pending = PyreonAuthPending.result
        if (redirect != null) pending?.complete(redirect) else pending?.completeExceptionally(PyreonAuthCancelled())
        finish()
    }

    public companion object {
        internal const val EXTRA_URL = "com.pyreon.auth.URL"
        private const val STATE_LAUNCHED = "com.pyreon.auth.LAUNCHED"
    }
}

/** Receives the provider redirect on the app's scheme and returns it to [PyreonAuthActivity]. */
public class PyreonAuthRedirectActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(
            Intent(this, PyreonAuthActivity::class.java)
                .setData(intent.data)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
        finish()
    }
}

/**
 * The container `useOidc(...)` lowers to on Android: the Keystore-backed store, the activity
 * browser and the app Context, wired once per composition.
 */
@Composable
public fun rememberPyreonOidcAuth(
    issuer: String,
    clientId: String,
    redirectUri: String,
    scope: String = "openid profile email",
    postLogoutRedirectUri: String? = null,
    authorizationParams: Map<String, String> = emptyMap(),
): PyreonOidcAuth {
    val context = LocalContext.current.applicationContext
    return remember(issuer, clientId, redirectUri) {
        PyreonOidcAuth(
            issuer = issuer,
            clientId = clientId,
            redirectUri = redirectUri,
            scope = scope,
            postLogoutRedirectUri = postLogoutRedirectUri,
            authorizationParams = authorizationParams,
            store = KeystoreSecureBackend(context, keyAlias = "pyreon.auth"),
            browser = PyreonActivityAuthBrowser(context),
        )
    }
}
