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

fun main() {
    testSchemaErrorMessages()
    testParseResultShape()
    println("[PyreonSchemaTest] all smoke tests passed")
}
