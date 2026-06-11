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
 * `<Text font="Brand">` emits `pyreonFont("brand")`. Throws when the
 * resource is missing — same loud-failure contract as pyreonDrawable.
 */
@Composable
public fun pyreonFont(name: String): FontFamily {
    val context = LocalContext.current
    val id = context.resources.getIdentifier(name, "font", context.packageName)
    require(id != 0) {
        "[Pyreon] Bundled font '$name' not found in res/font — did the assets/fonts step run?"
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
