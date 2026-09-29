// PyreonSchema — the types every PMTC-emitted schema data class shares
// (mirror of PyreonSchema.swift).
//
// A file-scope `s.object({ … })` / `z.object({ … })` lowers to a data class
// whose `parse` throws `PyreonSchemaError` and whose `safeParseResult` returns
// a `PyreonParseResult`. These used to be emitted INTO each file that declared
// a schema; two such files in one Gradle source set are one package, so each
// declared `PyreonSchemaError` and the build failed with a redeclaration.
// Declared once, here, they cannot collide.

package com.pyreon.runtime

sealed class PyreonSchemaError(message: String) : Exception(message) {
    data class MissingOrWrongType(val field: String, val expected: String) :
        PyreonSchemaError("Field '$field' missing or wrong type (expected $expected)")
    data class ConstraintViolation(val field: String, val rule: String) :
        PyreonSchemaError("Field '$field' violated constraint '$rule'")
}

/** The web-faithful `{ success, data }` result of `Schema.safeParse(x)`. */
data class PyreonParseResult<T>(val success: Boolean, val data: T?)
