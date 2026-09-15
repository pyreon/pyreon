package com.pyreon.runtime

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

data class PyreonChartWebViewSelection(
    val seriesName: String? = null,
    val seriesIndex: Int? = null,
    val name: String? = null,
    val dataIndex: Int? = null,
    val value: Any? = null,
    val componentType: String? = null,
)

data class PyreonChartWebViewEvent(val name: String, val payload: Map<String, Any?>)
data class PyreonChartWebViewError(val message: String)

fun pyreonChartWebViewData(
    option: String,
    commands: String,
    loading: Boolean,
    loadingOptions: String,
    group: String? = null,
): String = try {
    JSONObject()
        .put("__pyreonChartHost", 1)
        .put("option", JSONTokener(option).nextValue())
        .put("commands", JSONArray(commands))
        .put("loading", JSONObject().put("visible", loading).put("options", JSONObject(loadingOptions)))
        .apply { if (!group.isNullOrEmpty()) put("group", group) }
        .toString()
} catch (_: Exception) {
    option
}

fun pyreonDispatchChartWebViewMessage(
    message: String,
    onSelect: ((PyreonChartWebViewSelection) -> Unit)? = null,
    onEvent: ((PyreonChartWebViewEvent) -> Unit)? = null,
    onError: ((PyreonChartWebViewError) -> Unit)? = null,
) {
    val raw = try { JSONTokener(message).nextValue() } catch (_: Exception) {
        onSelect?.invoke(PyreonChartWebViewSelection(name = message))
        return
    }
    if (raw !is JSONObject) return
    if (raw.has("error")) {
        onError?.invoke(PyreonChartWebViewError(raw.opt("error")?.toString() ?: "Hosted chart failed"))
        return
    }
    if (raw.optInt("__pyreonChartEvent") == 1) {
        onEvent?.invoke(PyreonChartWebViewEvent(
            name = raw.optString("name"),
            payload = raw.optJSONObject("payload")?.toMap() ?: emptyMap(),
        ))
        return
    }
    onSelect?.invoke(PyreonChartWebViewSelection(
        seriesName = raw.optString("seriesName").ifEmpty { null },
        seriesIndex = raw.optInt("seriesIndex").takeIf { raw.has("seriesIndex") },
        name = raw.optString("name").ifEmpty { null },
        dataIndex = raw.optInt("dataIndex").takeIf { raw.has("dataIndex") },
        value = raw.opt("value").takeUnless { it == JSONObject.NULL },
        componentType = raw.optString("componentType").ifEmpty { null },
    ))
}

private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key ->
    when (val value = opt(key)) {
        JSONObject.NULL -> null
        is JSONObject -> value.toMap()
        is JSONArray -> (0 until value.length()).map { index -> value.opt(index) }
        else -> value
    }
}
