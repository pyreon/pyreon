// The Android half of PyreonSecureStorage — the real Keystore-backed backend
// plus the Context factory the compiler emit constructs.
//
// It lives in its OWN file for the same concrete gate reason as
// PyreonDatabaseAndroid: `scripts/run-kotlin-tests.ts` classifies any module
// importing `android.*` as SKIP-EXTERNAL, so folding this into
// PyreonSecureStorage.kt would silently drop the contract test out of the
// runnable set. The platform-free core stays genuinely RUN; only this file is
// Android-bound (verified `--typecheck-only` against stubs, like
// PyreonStorageAndroid / PyreonDatabaseAndroid).
//
// ## Why hand-rolled Keystore + javax.crypto, not androidx security-crypto
//
// `EncryptedSharedPreferences` (androidx.security:security-crypto) is
// DEPRECATED upstream, would add the only third-party artifact in the
// runtime, and is itself a wrapper over exactly this surface: an AES-GCM key
// in AndroidKeyStore encrypting values into SharedPreferences. Going to the
// platform API directly keeps the runtime dep-free and un-deprecated.
//
// ## Storage shape
//
// - ONE AES-256-GCM key, alias "pyreon.secure", generated lazily in
//   AndroidKeyStore (hardware-backed where available; never leaves the
//   Keystore — encryption happens through Cipher with the key handle).
// - Values land in app-private SharedPreferences ("pyreon_secure") as
//   base64(iv):base64(ciphertext). The IV is the cipher's own random
//   12-byte GCM nonce, stored alongside — standard GCM practice; never
//   reuse an IV, never derive it.
// - read() returns null on ANY failure (absent key, tampered ciphertext →
//   AEADBadTagException, Keystore key rotated away) — the contract's
//   "absent / unreadable" clause. A secret store must fail CLOSED.
//
// `PyreonSecureStorage(context)` reads as a constructor at every call site
// (Kotlin resolves a same-named function identically), which is what the
// compiler emit writes:
//
//     val secCtx = LocalContext.current
//     val sec = remember { PyreonSecureStorage(secCtx) }

package com.pyreon.runtime

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Keystore-backed secret store rooted in the app's private storage — what
 * `useSecureStorage()` lowers to, so a scaffolded app stores secrets
 * encrypted-at-rest without the author wiring a backend. */
@Suppress("FunctionName")
public fun PyreonSecureStorage(context: Context): PyreonSecureStorage =
    PyreonSecureStorage(KeystoreSecureBackend(context))

/**
 * AES-256-GCM over app-private SharedPreferences, key held in
 * AndroidKeyStore. See the file header for the design rationale.
 */
public class KeystoreSecureBackend(
    context: Context,
    private val keyAlias: String = "pyreon.secure",
) : PyreonSecureBackend {
    private val prefs =
        context.applicationContext.getSharedPreferences("pyreon_secure", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        val generator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    override fun write(key: String, value: String): Boolean =
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val iv = Base64.getEncoder().encodeToString(cipher.iv)
            val ct = Base64.getEncoder().encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)))
            prefs.edit().putString(key, "$iv:$ct").apply()
            true
        } catch (_: Exception) {
            false
        }

    override fun read(key: String): String? {
        // Block body deliberately: `return` is prohibited inside an
        // expression-body function (gradle's Kotlin rejects it even where a
        // standalone kotlinc is lenient — a real toolchain-divergence case).
        return try {
            val stored = prefs.getString(key, null) ?: return null
            val sep = stored.indexOf(':')
            if (sep <= 0) return null
            val iv = Base64.getDecoder().decode(stored.substring(0, sep))
            val ct = Base64.getDecoder().decode(stored.substring(sep + 1))
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(ct), Charsets.UTF_8)
        } catch (_: Exception) {
            null // fail CLOSED: tampered / undecryptable reads as absent
        }
    }

    override fun remove(key: String): Boolean {
        prefs.edit().remove(key).apply()
        return true // idempotent — absent key is still "removed"
    }
}
