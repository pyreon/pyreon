/**
 * Which validation library the generated schemas are written in.
 *
 * `@pyreon/validate` and zod turn out to share the vocabulary Lathe emits
 * almost exactly — `object`, `array`, `string`, `number`, `boolean`, `null`,
 * `unknown`, `enum`, `union`, `discriminatedUnion`, `record`, `lazy`, and the
 * `.min` / `.max` / `.regex` / `.email` / `.url` / `.uuid` / `.int` /
 * `.optional` / `.nullable` chains — so the emitter is ONE walk with a
 * different binding, not two renderers that can drift apart.
 *
 * Every spelling was verified against the installed zod (4.4.3), not inferred
 * from its changelog. `z.string().email()` is deprecated there in favour of
 * `z.email()`, and the deprecated spelling is emitted DELIBERATELY: it works in
 * both zod 3 and zod 4, while `z.email()` exists only in 4. A generator that
 * picks the newer spelling silently narrows the versions its output compiles
 * against, and the failure lands in the consumer's repo.
 *
 * ## Native
 *
 * Both reach native, through different doors, and they do NOT cover the same
 * shapes. PMTC recognises `@pyreon/validate`'s `s.object({ … })` directly, and
 * recognises zod only through `@pyreon/validation`'s `zodSchema(...)` wrapper.
 *
 * Measured against the real compiler (`native-schema-coverage.test.ts` pins
 * this, so it cannot rot):
 *
 * | shape | `s.*` | zod |
 * | --- | --- | --- |
 * | scalars, optional, nullable, arrays of scalars | lowers | lowers |
 * | a NESTED object | dropped | **lowers** |
 * | an ARRAY of objects | dropped | **lowers** |
 * | a field naming another model | dropped | dropped |
 *
 * The zod recogniser strictly dominates. That is the opposite of what you would
 * assume from `@pyreon/validate` being the first-party one, and it is why
 * `validator: 'zod'` is not merely an interoperability option — on the native
 * target it lowers strictly more of a real spec.
 *
 * The shared gap is a field that NAMES another model, which every OpenAPI
 * document of any size is full of. Under zod that gap closes by INLINING the
 * referenced model on the native path: an inlined ref is a nested object, and
 * nested objects lower. Under `s.*` inlining buys nothing, because nested
 * objects are dropped there too, so it is not done.
 */

/** The validation library the generated schemas are written in. */
export type ValidatorName = 'pyreon' | 'zod'

export const ALL_VALIDATORS: readonly ValidatorName[] = ['pyreon', 'zod']

export interface ValidatorDialect {
  name: ValidatorName
  /** The binding schema expressions are built on — `s` or `z`. */
  binding: string
  /** Module the binding is imported from. */
  module: string
  /** Module the inferred-type helper comes from, when there is one. */
  typeHelper: { module: string; name: string } | undefined
  /**
   * Wraps a native-path schema so PMTC recognises it.
   *
   * `@pyreon/validate` needs nothing — the compiler reads `s.object(...)`
   * directly. zod is recognised only inside `@pyreon/validation`'s
   * `zodSchema(...)`, which is gated on that distinctive wrapper call rather
   * than on the bare `z` name.
   */
  nativeWrap: { module: string; fn: string } | undefined
  /**
   * How to ANNOTATE a schema whose own expression refers back to it.
   *
   * A `$ref` cycle emits `lazy(() => X)` inside `const X = …`, so inferring
   * `X`'s type from its own initializer is circular and TypeScript gives up
   * with TS7022/TS7024 — the generated module does not compile. Naming the
   * structural type first and annotating the const breaks the cycle, which is
   * the pattern both libraries document for recursive schemas.
   */
  schemaTypeRef: (type: string) => string
  /** Type-only import the annotation needs, if any. */
  schemaTypeImport: { module: string; name: string } | undefined
  /**
   * Does this library's `enum` widen its members to `string` in the inferred
   * type?
   *
   * `@pyreon/validate`'s does — `s.enum(['a','b'])` infers `string`, not
   * `'a' | 'b'`. zod's preserves the literals. It matters only where the
   * declared type is written OUT rather than inferred (the cyclic-schema
   * annotation): declaring a narrower union than the schema actually produces
   * is exactly the drift between declared type and runtime schema that
   * generating both from one walk exists to prevent.
   */
  enumWidensToString: boolean
  /**
   * Does inlining a `$ref` on the native path help?
   *
   * Only where nested objects lower. Inlining under `s.*` would trade one
   * dropped field for another and make the emitted schema much larger for
   * nothing.
   */
  inlineRefsOnNative: boolean
}

export const DIALECTS: Readonly<Record<ValidatorName, ValidatorDialect>> = {
  pyreon: {
    name: 'pyreon',
    binding: 's',
    module: '@pyreon/validate',
    typeHelper: { module: '@pyreon/validate', name: 'Infer' },
    nativeWrap: undefined,
    schemaTypeRef: (t) => `Schema<${t}>`,
    schemaTypeImport: { module: '@pyreon/validate', name: 'Schema' },
    enumWidensToString: true,
    inlineRefsOnNative: false,
  },
  zod: {
    name: 'zod',
    binding: 'z',
    module: 'zod',
    // zod infers with `z.infer<typeof X>`, which needs no separate import.
    typeHelper: undefined,
    nativeWrap: { module: '@pyreon/validation', fn: 'zodSchema' },
    // `z.ZodType` is reachable through the `z` binding already imported, so
    // the annotation costs no extra import.
    schemaTypeRef: (t) => `z.ZodType<${t}>`,
    schemaTypeImport: undefined,
    enumWidensToString: false,
    inlineRefsOnNative: true,
  },
}

export function dialectOf(validator: ValidatorName): ValidatorDialect {
  return DIALECTS[validator]
}
