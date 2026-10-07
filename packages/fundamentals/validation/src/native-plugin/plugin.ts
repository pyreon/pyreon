import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  topLevelDeclarators,
  type CallRecognizer,
  type CompilerPlugin,
} from '@pyreon/native-compiler/plugin-api'
import { VALIDATION_PLUGIN_NAME } from './names'
import {
  SCHEMA_ADAPTERS,
  tryArktypeSchemaDefnFromTopLevel,
  tryValibotSchemaDefnFromTopLevel,
  tryZodSchemaDefnFromTopLevel,
  warnUnloweredSchemaAdapter,
} from './recognize'
import { createSchemaItem, createSchemaStructRefinement, schemaItemSpec } from './schema'

export { VALIDATION_PLUGIN_NAME }

/**
 * The Tier-2 diagnostic for a call of one of this package's helpers the recognizers above did not lower (an
 * adapter inside a component body, a `*Field` helper): the setup call would emit as an unresolved reference.
 * It CLAIMS the call (`null`), so the binding does not fall through to a generic emit either.
 */
const tier2: CallRecognizer = (call, ctx) => {
  const bindingName = ctx.declName
  ctx.report(
    `${call.callee}() declared (@pyreon/validation, binding: \`${bindingName}\`) — Tier-2 package on native: parser ` +
      `recognition + runtime port not yet shipped. Setup function will not run on iOS/Android; downstream ` +
      `uses of \`${bindingName}\` emit as unresolved references and may fail swiftc/kotlinc validation. ` +
      `Use a per-target adapter (Layer 4: <NativeIOS> / <NativeAndroid>) to provide the same surface natively, ` +
      `or keep this code in a \`<Web>\`-only branch. Tracked in audit Gap 4; see ` +
      `docs/src/content/docs/multiplatform-libraries.md → "Tier 2 — pure-logic packages."`,
  )
  return null
}

/**
 * The `@pyreon/validation` native plugin: `zodSchema(z.object({…}))`, `valibotSchema(v.object({…}))` and
 * `arktypeSchema(type({…}))` at the top of a file lower to a native struct / data class with `parse`,
 * `safeParse` and per-field constraint checks — the same model `@pyreon/validate`'s `s` DSL lowers to, which
 * is why the model, its emitters, its form validators and its response-type evidence live in `./schema` and
 * `@pyreon/validate`'s plugin reuses them.
 *
 * What a schema is evidence FOR is published to other code through the compiler's module-item seams, never by
 * importing this plugin: a form that names it (`useForm({ schema })`) reads its per-field validators, and an
 * endpoint's `response` makes its number fields the `Int` / `Double` evidence for the decode type.
 */
export const validationPlugin: CompilerPlugin = {
  name: VALIDATION_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/validation'],
  scanModule(scan) {
    // The unlowered-module warning runs before the declarations are recognized, so "does a schema lower?" is
    // answered syntactically here: any adapter call at the top level means the blanket line would print directly
    // above the struct it denies.
    for (const node of scan.body) {
      for (const d of topLevelDeclarators(node)) {
        const init = d.init
        if (init?.type !== 'CallExpression' || init.callee?.type !== 'Identifier') continue
        if (!SCHEMA_ADAPTERS.has(init.callee.name as string)) continue
        for (const adapter of SCHEMA_ADAPTERS) scan.lowered('@pyreon/validation', adapter)
        return
      }
    }
  },
  topLevel(node, ctx) {
    const hit =
      tryZodSchemaDefnFromTopLevel(node, ctx) ??
      tryValibotSchemaDefnFromTopLevel(node, ctx) ??
      tryArktypeSchemaDefnFromTopLevel(node, ctx)
    if (hit !== null) return schemaItemSpec(hit)
    // Every recognizer declined. They all key on the INLINE argument (`zodSchema(z.object({ … }))`), so the
    // ordinary refactor of lifting the schema to its own const — `const base = z.string()` then
    // `zodSchema(base)` — matches none of them and falls through to a VERBATIM emit. `z` / `v` / `type` exist
    // in neither Swift nor Kotlin, so the generated file fails to compile with nothing said at emit time.
    // Declining is correct — synthesizing a struct from an unresolved binding would be a guess — but a decline
    // has to be OBSERVABLE, or it is indistinguishable from shipping it broken.
    warnUnloweredSchemaAdapter(node, ctx)
    return undefined
  },
  items: { schema: createSchemaItem({ declaredBy: 'zodSchema/valibotSchema/arkTypeSchema' }) },
  refineStructs: createSchemaStructRefinement(VALIDATION_PLUGIN_NAME),
  // Every recognizer here only CLAIMS the call (`null`) and declares nothing, so there is no declaration type to emit.
  decls: {},
  calls: {
    zodSchema: tier2,
    valibotSchema: tier2,
    arktypeSchema: tier2,
    zodField: tier2,
    valibotField: tier2,
    arktypeField: tier2,
  },
  unlowered: {
    '@pyreon/validation': {
      // The old advice claimed the helpers are web-only. They are not:
      // `zodSchema(z.object({…}))` at top level lowers to a real native
      // struct with parse/safeParse, and the warning appeared directly
      // ABOVE that struct in the same output — telling an author to wrap
      // working code in a `<Web>` escape hatch.
      advice:
        'a TOP-LEVEL `const X = zodSchema(z.object({ … }))` DOES lower — it emits a native struct with parse/safeParse. What stays web-only is the runtime surface around it (inline `.parse()` on an expression, `standardSchemaToValidator`, the async validate path)',
    },
  },
}
