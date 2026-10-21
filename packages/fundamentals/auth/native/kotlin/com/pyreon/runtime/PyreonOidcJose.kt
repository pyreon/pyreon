package com.pyreon.runtime

import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.security.spec.RSAPublicKeySpec
import java.util.Base64

// Pyreon auth — ID-token verification for Android. Mirrors @pyreon/auth's `verifyIdToken`
// (src/jwt.ts) and PyreonOidcJose.swift check for check and IN ORDER, so a token gets the
// same verdict and error code on all three targets (native/tests/vectors.json):
//
//   compact JWS → header/payload JSON objects → no `crit` → alg ∈ {RS256, ES256}
//   → candidate keys (kid, alg, use, kty) → signature → iss → aud → azp → exp → nbf
//   → sub → nonce

public object PyreonJose {
    private val ALPHABET = Regex("^[A-Za-z0-9_-]*$")

    /**
     * Strict base64url: url-safe alphabet only, canonical encoding. Mirrors `decodeBase64url`.
     * The alphabet test is a cheap explicit first check; the canonical re-encode below already
     * rejects everything it does, which is what makes the rule exact.
     */
    public fun decodeBase64url(s: String): ByteArray? {
        if (!ALPHABET.matches(s) || s.length % 4 == 1) return null
        val bytes = try { Base64.getUrlDecoder().decode(s) } catch (_: IllegalArgumentException) { return null }
        return if (PyreonPKCE.base64url(bytes) == s) bytes else null
    }

    /** A JSON number, never a boolean (the web checks `typeof x === 'number'`). */
    public fun number(v: Any?): Double? = v as? Double

    /** UNSET = absent, JSON null or "" — the rule all three verifiers share. */
    internal fun isUnset(v: Any?): Boolean = v == null || v === PyreonJsonNull || v == ""

    internal fun unsetOr(v: Any?, expected: String): Boolean = isUnset(v) || v == expected

    internal fun selects(tokenKid: Any?, keyKid: Any?): Boolean =
        if (isUnset(tokenKid)) true else tokenKid is String && keyKid == tokenKid

    /** Verify an OIDC ID token and return its claims. [nowS] is seconds since the epoch. */
    public fun verifyIdToken(
        token: String,
        keys: List<Map<String, Any?>>,
        issuer: String,
        clientId: String,
        nonce: String?,
        nowS: Double = System.currentTimeMillis() / 1000.0,
        skew: Double = 60.0,
    ): Map<String, Any?> {
        fun bad(code: String, msg: String) = PyreonAuthError(code, msg)
        val segs = token.split(".")
        if (segs.size != 3) throw bad("bad_token", "not a compact JWS")
        val hd = decodeBase64url(segs[0])
        val pd = decodeBase64url(segs[1])
        val header = hd?.let { PyreonAuthJson.obj(it) }
        val claims = pd?.let { PyreonAuthJson.obj(it) }
        if (header == null || claims == null) throw bad("bad_token", "token header and payload must be JSON objects")
        if (header.containsKey("crit")) throw bad("bad_token", "token declares critical header extensions")
        val alg = header["alg"]
        if (alg != "RS256" && alg != "ES256") throw bad("bad_alg", "unsupported alg")
        alg as String
        val kty = if (alg == "RS256") "RSA" else "EC"
        val candidates = keys.filter { k ->
            selects(header["kid"], k["kid"]) && unsetOr(k["alg"], alg) && unsetOr(k["use"], "sig") && k["kty"] == kty
        }
        if (candidates.isEmpty()) throw bad("no_key", "no matching signing key")
        val signature = decodeBase64url(segs[2]) ?: throw bad("bad_signature", "signature is not base64url")
        val input = "${segs[0]}.${segs[1]}".toByteArray(Charsets.US_ASCII)
        if (candidates.none { verify(alg, it, signature, input) }) throw bad("bad_signature", "signature verification failed")

        val now = Math.floor(nowS)
        if (claims["iss"] != issuer) throw bad("bad_iss", "iss does not match the provider")
        val aud: List<Any?> = (claims["aud"] as? List<*>) ?: listOf(claims["aud"])
        if (aud.none { it == clientId }) throw bad("bad_aud", "aud does not include this client")
        if (aud.size > 1 && claims["azp"] != clientId) throw bad("bad_azp", "multi-audience token needs azp = client")
        val exp = number(claims["exp"])
        if (exp == null || exp + skew < now) throw bad("expired", "token expired")
        if (claims.containsKey("nbf")) {
            val nbf = number(claims["nbf"])
            if (nbf == null || nbf - skew > now) throw bad("not_yet_valid", "token is not valid yet (nbf)")
        }
        val sub = claims["sub"]
        if (sub !is String || sub.isEmpty()) throw bad("bad_token", "missing sub")
        if (nonce != null) {
            val got = claims["nonce"]
            if (got !is String || !PyreonPKCE.constantTimeEqual(got, nonce)) throw bad("bad_nonce", "nonce mismatch")
        }
        return claims
    }

    /** One candidate key; a key that cannot be imported verifies nothing (as on the web). */
    internal fun verify(alg: String, jwk: Map<String, Any?>, signature: ByteArray, input: ByteArray): Boolean = try {
        if (alg == "ES256") {
            val x = (jwk["x"] as? String)?.let(::decodeBase64url)
            val y = (jwk["y"] as? String)?.let(::decodeBase64url)
            if (jwk["crv"] != "P-256" || x == null || y == null || x.size != 32 || y.size != 32 || signature.size != 64) {
                false
            } else {
                val params = AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }
                    .getParameterSpec(ECParameterSpec::class.java)
                val key = KeyFactory.getInstance("EC")
                    .generatePublic(ECPublicKeySpec(ECPoint(BigInteger(1, x), BigInteger(1, y)), params))
                Signature.getInstance("SHA256withECDSA").run {
                    initVerify(key)
                    update(input)
                    verify(rawToDer(signature))
                }
            }
        } else {
            val n = (jwk["n"] as? String)?.let(::decodeBase64url)
            val e = (jwk["e"] as? String)?.let(::decodeBase64url)
            if (n == null || e == null) {
                false
            } else {
                val key = KeyFactory.getInstance("RSA").generatePublic(RSAPublicKeySpec(BigInteger(1, n), BigInteger(1, e)))
                Signature.getInstance("SHA256withRSA").run {
                    initVerify(key)
                    update(input)
                    verify(signature)
                }
            }
        }
    } catch (_: Exception) {
        false
    }

    /** JOSE raw r||s (64 bytes) → the DER SEQUENCE the JDK's ECDSA verifier expects. */
    internal fun rawToDer(raw: ByteArray): ByteArray {
        fun int(part: ByteArray): ByteArray {
            var v = part.dropWhile { it == 0.toByte() }.toByteArray()
            if (v.isEmpty()) v = byteArrayOf(0)
            if (v[0].toInt() and 0x80 != 0) v = byteArrayOf(0) + v
            return byteArrayOf(0x02, v.size.toByte()) + v
        }
        val body = int(raw.copyOfRange(0, 32)) + int(raw.copyOfRange(32, 64))
        return byteArrayOf(0x30, body.size.toByte()) + body
    }
}
