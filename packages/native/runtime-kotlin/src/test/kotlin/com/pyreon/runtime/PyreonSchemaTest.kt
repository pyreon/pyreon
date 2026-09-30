// PyreonSchema smoke — the shared schema types emitted code throws and returns.

package com.pyreon.runtime

fun testSchemaErrorMessages() {
    val missing: PyreonSchemaError = PyreonSchemaError.MissingOrWrongType("age", "Int")
    check(missing.message == "Field 'age' missing or wrong type (expected Int)") { "got=${missing.message}" }
    val violated: PyreonSchemaError = PyreonSchemaError.ConstraintViolation("name", "min length 2")
    check(violated.message == "Field 'name' violated constraint 'min length 2'") { "got=${violated.message}" }
    // Catchable as the sealed base, which is how the emitted safeParse catches it.
    val caught = try { throw violated } catch (e: PyreonSchemaError) { e }
    check(caught is PyreonSchemaError.ConstraintViolation && caught.rule == "min length 2")
}

fun testParseResultShape() {
    val ok = PyreonParseResult(true, 3)
    check(ok.success && ok.data == 3)
    val bad = PyreonParseResult<Int>(false, null)
    check(!bad.success && bad.data == null)
}

// The reader behind `pyreonSchemaInput` — what a typed value becomes on its way
// into a schema. (The kotlinx half is stubbed here; the reader is pure.)
fun testSchemaJsonReader() {
    @Suppress("UNCHECKED_CAST")
    val m = pyreonSchemaJson("""{"name":"Rex","age":3,"w":3.5,"n":3.0,"ok":true,"tags":["a","b"],"owner":{"email":"a@b.co"},"x":null,"q":"say \"hi\"\n\u00e9"}""") as Map<String, Any?>
    check(m["name"] == "Rex")
    check(m["age"] == 3 && m["age"] is Int) { "age=${m["age"]}" }
    check(m["w"] == 3.5)
    // An integral double is an Int, as JS (one number type) and Swift's
    // NSNumber bridging both treat it — so the schema's `as? Int` accepts it.
    check(m["n"] == 3 && m["n"] is Int) { "n=${m["n"]}" }
    check(m["ok"] == true)
    check(m["tags"] == listOf("a", "b"))
    check((m["owner"] as Map<String, Any?>)["email"] == "a@b.co")
    check(m.containsKey("x") && m["x"] == null)
    check(m["q"] == "say \"hi\"\n\u00e9") { "q=${m["q"]}" }
    // Malformed input is null — a schema rejects it, nothing throws.
    check(pyreonSchemaJson("{\"a\":") == null)
    check(pyreonSchemaJson("{} trailing") == null)
    // A map is passed through untouched.
    val lit = mapOf<String, Any?>("a" to 1)
    check(pyreonSchemaInput(lit) === lit)
}

fun main() {
    testSchemaErrorMessages()
    testParseResultShape()
    testSchemaJsonReader()
    println("[PyreonSchemaTest] all smoke tests passed")
}
