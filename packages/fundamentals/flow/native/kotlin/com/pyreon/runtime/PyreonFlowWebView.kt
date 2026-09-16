package com.pyreon.runtime

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

data class PyreonFlowWebViewSelection(val id: String, val data: Any? = null)
data class PyreonFlowWebViewViewport(val x: Double, val y: Double, val zoom: Double)

data class PyreonFlowWebViewEvent(
    val type: String,
    val id: String? = null,
    val data: Any? = null,
    val source: String? = null,
    val target: String? = null,
    val viewport: PyreonFlowWebViewViewport? = null,
)

data class PyreonFlowWebViewError(val message: String)

fun pyreonFlowWebViewData(graph: String, commands: String): String = try {
    JSONObject(graph).put("__pyreonFlowCommands", JSONArray(commands)).toString()
} catch (_: Exception) {
    graph
}

fun pyreonDispatchFlowWebViewMessage(
    message: String,
    onSelect: ((PyreonFlowWebViewSelection) -> Unit)? = null,
    onMessage: ((Any?) -> Unit)? = null,
    onEvent: ((PyreonFlowWebViewEvent) -> Unit)? = null,
    onError: ((PyreonFlowWebViewError) -> Unit)? = null,
) {
    val raw = try { JSONTokener(message).nextValue() } catch (_: Exception) { message }
    onMessage?.invoke(pyreonFlowJsonValue(raw))
    if (raw !is JSONObject) {
        if (raw is String) onSelect?.invoke(PyreonFlowWebViewSelection(raw))
        return
    }
    if (raw.optInt("__pyreonFlowHostError") == 1) {
        onError?.invoke(PyreonFlowWebViewError(raw.optString("message", "Flow host failed")))
        return
    }
    if (raw.has("id")) {
        val id = raw.optString("id")
        val data = pyreonFlowJsonValue(raw.opt("data"))
        onSelect?.invoke(PyreonFlowWebViewSelection(id, data))
    }
    if (raw.has("id") && !raw.has("type")) {
        val id = raw.optString("id")
        val data = pyreonFlowJsonValue(raw.opt("data"))
        onEvent?.invoke(PyreonFlowWebViewEvent(type = "node-select", id = id, data = data))
        return
    }
    val type = raw.optString("type")
    if (type != "edge-select" && type != "viewport-change") return
    val viewportObject = raw.optJSONObject("viewport")
    val viewport = viewportObject?.let {
        PyreonFlowWebViewViewport(it.optDouble("x"), it.optDouble("y"), it.optDouble("zoom", 1.0))
    }
    onEvent?.invoke(PyreonFlowWebViewEvent(
        type = type,
        id = raw.optString("id").ifEmpty { null },
        source = raw.optString("source").ifEmpty { null },
        target = raw.optString("target").ifEmpty { null },
        viewport = viewport,
    ))
}

private fun pyreonFlowJsonValue(value: Any?): Any? = when (value) {
    null, JSONObject.NULL -> null
    is JSONObject -> value.keys().asSequence().associateWith { pyreonFlowJsonValue(value.opt(it)) }
    is JSONArray -> (0 until value.length()).map { pyreonFlowJsonValue(value.opt(it)) }
    else -> value
}
