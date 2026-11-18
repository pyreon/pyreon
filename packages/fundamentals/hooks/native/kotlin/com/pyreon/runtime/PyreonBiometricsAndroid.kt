// The Android half of PyreonBiometrics: `androidx.biometric`'s BiometricManager
// decides availability and BiometricPrompt asks the user. Its own file so
// PyreonBiometrics.kt stays free of `android.*` (the Kotlin test runner skips any
// module that imports the Android SDK, and that would stop the contract test from
// running).
//
// Requirements on the host app, both checked here rather than assumed:
//   - the `androidx.biometric:biometric` dependency (every Pyreon Android template
//     and example declares it);
//   - a `FragmentActivity` host, because BiometricPrompt attaches a fragment. A
//     plain `ComponentActivity` cannot show the prompt, so `authenticate` resolves
//     false and logs why instead of crashing.

package com.pyreon.runtime

import android.content.Context
import android.content.ContextWrapper
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/** What `useBiometrics()` lowers to: the real BiometricPrompt gate over [context]. */
@Suppress("FunctionName")
public fun PyreonBiometrics(context: Context): PyreonBiometrics = PyreonBiometrics(BiometricPromptGate(context))

/** BiometricManager + BiometricPrompt, strong biometrics only (the class iOS Face ID / Touch ID belong to). */
public class BiometricPromptGate(private val context: Context) : PyreonBiometricGate {
    override fun isAvailable(): Boolean =
        BiometricManager.from(context).canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

    override suspend fun prompt(reason: String): Boolean {
        val activity = context.findFragmentActivity()
        if (activity == null) {
            Log.w(
                "Pyreon",
                "[Pyreon] useBiometrics: the host Activity is not a FragmentActivity, so BiometricPrompt cannot be " +
                    "shown and authenticate() resolves false. Make MainActivity extend " +
                    "androidx.fragment.app.FragmentActivity.",
            )
            return false
        }
        return suspendCoroutine { cont ->
            var settled = false
            fun settle(ok: Boolean) {
                if (settled) return
                settled = true
                cont.resume(ok)
            }
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = settle(true)

                // Cancel, lockout, no hardware, the negative button: all end the prompt.
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = settle(false)

                // onAuthenticationFailed is a rejected ATTEMPT; the prompt stays up and
                // the user can try again, so it does not settle the call.
            }
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(reason)
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(BIOMETRIC_STRONG)
                .build()
            BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback).authenticate(info)
        }
    }
}

private tailrec fun Context.findFragmentActivity(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.findFragmentActivity()
    else -> null
}
