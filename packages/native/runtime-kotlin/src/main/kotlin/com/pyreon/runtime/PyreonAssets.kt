// PyreonAssets — name-keyed access to bundled drawable resources
// (asset-pipeline arc, 2026-06-11).
//
// The PMTC bundled-image emit is `painterResource(pyreonDrawable("logo"))`
// rather than `painterResource(R.drawable.logo)` ON PURPOSE: an
// `R.drawable` reference couples the generated file to the host app's
// namespace (the generated package is `<ns>.generated`, R lives at
// `<ns>` — un-knowable to the compiler without extra config) and makes
// the kotlinc validate stubs fixture-coupled (the stub R object would
// need a field per asset name any fixture uses). A name-keyed runtime
// lookup keeps the emit host-agnostic; `getIdentifier`'s reflective
// cost is a one-time-per-composition lookup on a demo-scale asset set.
//
// The `pyreon-native assets` CLI step materializes the shared
// `assets/` directory into `res/drawable*` with names sanitized to
// Android resource rules (lowercase, [a-z0-9_]) — `pyreonDrawable`
// applies the SAME sanitize so the emitted name always matches the
// materialized resource.

package com.pyreon.runtime

import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily

/**
 * Resolve a bundled drawable's resource id by its canonical asset
 * name. Throws with an actionable message when the asset wasn't
 * materialized (run the assets step / check the name) — a silent 0 id
 * would crash deeper inside painterResource with a cryptic
 * Resources$NotFoundException.
 */
@Composable
public fun pyreonDrawable(name: String): Int {
    val context = LocalContext.current
    val sanitized = sanitizeResourceName(name)
    val id = context.resources.getIdentifier(sanitized, "drawable", context.packageName)
    require(id != 0) {
        "[Pyreon] Bundled image '$name' (resource '$sanitized') not found — " +
            "did the assets build step run, and does assets/$name exist?"
    }
    return id
}

/**
 * Resolve a bundled font (res/font/<name>.ttf, materialized by the
 * assets/fonts step) into a Compose FontFamily by its sanitized name.
 * `<Text font="Brand">` emits `pyreonFont("brand")`.
 *
 * A MISSING font falls back to the system default and logs, rather than
 * throwing. That is deliberate, and it fixes a cross-platform severity
 * mismatch: the iOS emit uses `Font.custom`, which falls back to the system
 * font on-device (the compiler even says so in its warning), so the SAME
 * shared source degraded gracefully on iOS and CRASHED the app on Android.
 * A real app hit exactly that — `<Text font="Brand">` on a screen whose font
 * had not been bundled took the whole activity down at composition time.
 *
 * Typography is cosmetic; a missing typeface must never be fatal. The
 * compiler already warns at BUILD time when no bundled font matches the name,
 * which is where a missing asset should be caught — and unlike this call site,
 * that warning cannot be missed in a log.
 *
 * `pyreonDrawable` keeps its `require`: a missing IMAGE has no meaningful
 * fallback (there is nothing to draw), so failing loudly is right there.
 *
 * REGRESSION LOCK: the gated `native-finance-android` app renders
 * `<Text font="Brand">` with no bundled font, so its instrumented test
 * exercises this exact path on a real emulator — a regression back to throwing
 * crashes that test rather than slipping through. (This file has no
 * verify-kotlin stub set, so the device gate is its coverage; adding one is a
 * tracked follow-up.)
 */
@Composable
public fun pyreonFont(name: String): FontFamily {
    val context = LocalContext.current
    val id = context.resources.getIdentifier(name, "font", context.packageName)
    if (id == 0) {
        Log.w(
            "Pyreon",
            "Bundled font '$name' not found in res/font — falling back to the system font. " +
                "Run the assets/fonts step to bundle it (iOS falls back the same way).",
        )
        return FontFamily.Default
    }
    return FontFamily(Font(id))
}

/**
 * Android resource-name rules: lowercase, [a-z0-9_], no leading digit.
 * MUST stay in lockstep with the CLI materializer's sanitizer
 * (packages/native/cli/src/assets.ts) — the emitted lookup name and
 * the materialized filename are produced by the two halves.
 */
public fun sanitizeResourceName(name: String): String {
    val base = name.substringBeforeLast('.')
    val cleaned = base.lowercase().replace(Regex("[^a-z0-9_]"), "_")
    return if (cleaned.firstOrNull()?.isDigit() == true) "_$cleaned" else cleaned
}
