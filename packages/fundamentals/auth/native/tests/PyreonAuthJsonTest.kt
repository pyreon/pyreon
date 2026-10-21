// The auth runtime's JSON reader: strict RFC 8259, with JSON null distinct from absent.

package com.pyreon.runtime

fun testJsonValues() {
    @Suppress("UNCHECKED_CAST")
    val o = PyreonAuthJson.parse("""{"a":1,"b":[true,false,null],"c":"x\u00e9\n","d":{"e":-1.5e2}}""") as Map<String, Any?>
    check(o["a"] == 1.0) { "number" }
    check(o["b"] == listOf(true, false, PyreonJsonNull)) { "array + literals: ${o["b"]}" }
    check(o["c"] == "xé\n") { "string escapes" }
    check((o["d"] as Map<*, *>)["e"] == -150.0) { "exponent" }
    check(!o.containsKey("z") && o.containsKey("b")) { "absent is not null" }
}

fun testJsonRejects() {
    val bad = listOf(
        "", "{", "{\"a\":}", "[1,]", "{\"a\":1,}", "01", "1.", ".5", "+1", "--1", "\"\\x\"", "\"\u0001\"",
        "tru", "nul", "{\"a\" 1}", "[1 2]", "{} x", "'a'", "\"\\u12\"", "NaN", "Infinity",
    )
    for (b in bad) {
        val ok = try { PyreonAuthJson.parse(b); true } catch (_: IllegalArgumentException) { false }
        check(!ok) { "rejects ${'"'}$b${'"'}" }
    }
    // Depth is capped by the parser itself — not left to a StackOverflowError, which a
    // caller catching Exception would not even see. 100 levels is far from overflowing,
    // so only the cap can refuse it.
    for (depth in listOf(100, 10_000)) {
        val deep = "[".repeat(depth) + "]".repeat(depth)
        val refused = try { PyreonAuthJson.parse(deep); false } catch (_: IllegalArgumentException) { true }
        check(refused) { "nesting $depth deep refused by the cap" }
    }
    check(runCatching { PyreonAuthJson.parse("[".repeat(60) + "]".repeat(60)) }.isSuccess) { "ordinary nesting accepted" }
    // Invalid UTF-8 is not JSON.
    check(PyreonAuthJson.parse(byteArrayOf(0x7b, 0xff.toByte(), 0x7d)) == null) { "invalid UTF-8 refused" }
}

fun testJsonRoundTrip() {
    val record = linkedMapOf<String, Any?>("s" to "a\"b\\c\u0001", "n" to 1.0, "f" to 1.5, "b" to true, "m" to mapOf("k" to "v"))
    val text = PyreonAuthJson.stringify(record)
    check(text == """{"s":"a\"b\\c\u0001","n":1,"f":1.5,"b":true,"m":{"k":"v"}}""") { "stringify: $text" }
    check(PyreonAuthJson.parse(text) == record) { "round trip" }
}

fun main() {
    testJsonValues()
    testJsonRejects()
    testJsonRoundTrip()
    println("[PyreonAuthJsonTest] all smoke tests passed")
}
