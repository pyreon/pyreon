// A `Date` field in JSON — the mirror of the property wrappers at the end of the Swift runtime's `PyreonDate.swift`.
//
// On the web a `Date` crosses JSON as its ISO string: `JSON.stringify` writes `toISOString()` (`null` for an invalid
// date), and a server sends the same text. Natively the field is its epoch milliseconds like every other date, so the
// compiler marks each data-class property the source types `Date` with `@Serializable(with = PyreonDateSerializer::class)`
// (or the list twin): it reads an ISO string (any string `new Date(text)` reads; a number is taken as milliseconds;
// `null` is an invalid date) and writes the ISO string back. The property the code sees is the plain `Double`.
//
// Verified with the REAL kotlinx-serialization (the per-service stub harness has no serializer surface to compile it
// against): `@pyreon/native-compiler`'s `native-date-json.test.ts` compiles and runs it on the JVM.

package com.pyreon.runtime

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/** A `Date` property (`at: Date`; nullable for `at?: Date`, which kotlinx wraps itself). */
object PyreonDateSerializer : KSerializer<Double> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("com.pyreon.runtime.PyreonDate", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Double) {
        if (value.isFinite()) encoder.encodeString(pyreonDateISO(value)) else encoder.encodeNull()
    }

    override fun deserialize(decoder: Decoder): Double {
        if (decoder is JsonDecoder) {
            val element = decoder.decodeJsonElement()
            if (element is JsonNull) return Double.NaN
            val primitive = element as? JsonPrimitive ?: throw IllegalArgumentException("[Pyreon] a Date field holds a JSON object or array")
            return if (primitive.isString) {
                pyreonDateFrom(primitive.content)
            } else {
                pyreonDateFrom(primitive.content.toDoubleOrNull() ?: throw IllegalArgumentException("[Pyreon] a Date field holds ${primitive.content}"))
            }
        }
        return pyreonDateFrom(decoder.decodeString())
    }
}

/** A `Date[]` property: each element as one date. */
object PyreonDateListSerializer : KSerializer<List<Double>> by ListSerializer(PyreonDateSerializer)
