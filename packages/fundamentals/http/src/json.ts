/**
 * `@pyreon/http/json` — a LOSSLESS JSON codec for 64-bit integers.
 *
 * `JSON.parse` turns every number into an IEEE-754 double, so an integer past
 * `Number.MAX_SAFE_INTEGER` (2^53 - 1) is ROUNDED before any code — a schema, a
 * reviver's `value` argument — ever sees it: `9007199254740993` arrives as
 * `9007199254740992`. For an OpenAPI `format: int64` id that is not a
 * cosmetic loss; it is a different record.
 *
 * {@link losslessJson} decodes such an integer as a `bigint` instead, and
 * encodes a `bigint` back as JSON NUMBER text (`JSON.stringify` throws on one).
 * Every other value is exactly what `JSON.parse` / `JSON.stringify` produce:
 * a safe integer stays a `number`, a fraction or an exponent form (`1e21`)
 * stays a `number` — the server wrote a double, and a double is what arrives.
 *
 * ```ts
 * import { createHttp } from '@pyreon/http'
 * import { losslessJson } from '@pyreon/http/json'
 *
 * const api = createHttp({ baseUrl: '/api', json: losslessJson })
 * const order = await api.get('/orders/1').json<{ id: bigint | number }>()
 * ```
 *
 * ## How precision is recovered, portably
 *
 * The exact digits are only available from the SOURCE TEXT. Three layers, the
 * cheapest that is correct wins:
 *
 * 1. **No run of 16+ digits anywhere** (the overwhelmingly common body): no
 *    unsafe integer can be present — 2^53 has 16 digits — so plain
 *    `JSON.parse`, at native speed.
 * 2. **The reviver's `context.source`** (TC39 "JSON.parse source text
 *    access"), DETECTED at first use rather than assumed — verified present on
 *    Node 26 (V8) and Bun 1.4 (JSC): still the native parser, with a reviver
 *    that re-reads an unsafe integer's own digits.
 * 3. **An own parser** wherever (2) is missing (older engines, Hermes). It follows `JSON.parse`'s grammar and error class exactly, so a
 *    body that `JSON.parse` rejects is rejected here too.
 *
 * Encoding prefers `JSON.rawJSON` (same proposal); without it a `bigint` is
 * written through a verified placeholder — see {@link stringifyJsonLossless}.
 */

export type { JsonCodec } from './types'
export { losslessJson, parseJsonLossless, stringifyJsonLossless } from './json-lossless'
