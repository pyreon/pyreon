// PyreonJson — serialization helper for the `<WebView>` live-data bridge
// (mirror of PyreonJSON.swift). PMTC emits `PyreonJson.encode(signal)`
// for `<WebView data={signal}>`; this encodes any `@Serializable` value
// (PMTC-emitted data classes carry `@Serializable`) to a compact JSON
// string for injecting into the hosted page as `window.__pyreonData`.
//
// Uses the same `Json.encodeToString(serializer<T>(), value)` surface as
// PyreonStorage, so it links against the same kotlinx-serialization API
// (covered by the runtime's kotlinc verify stubs).

package com.pyreon.runtime

import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

object PyreonJson {
    inline fun <reified T> encode(value: T): String =
        Json.encodeToString(serializer<T>(), value)
}
