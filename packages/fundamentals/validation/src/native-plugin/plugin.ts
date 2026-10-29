import {
  topLevelDeclarators,
  type CallRecognizer,
  type CompilerPlugin,
} from '@pyreon/native-compiler/plugin-api'
import { finishValidation, lowerMultiDeclarator, recognizeValidationMethodCall, scanValidationBindings } from './bound'
import { VALIDATION_PLUGIN_NAME } from './names'
import {
  SCHEMA_ADAPTERS,
  tryArktypeSchemaDefnFromTopLevel,
  tryValibotSchemaDefnFromTopLevel,
  tryZodSchemaDefnFromTopLevel,
  warnUnloweredSchemaAdapter,
} from './recognize'
import { safeParseExpr } from './safe-parse'
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
    `${call.callee}() declared (@pyreon/validation, binding: \`${bindingName}\`) in a position that does not lower — ` +
      `only a TOP-LEVEL \`const ${bindingName} = ${call.callee}(…)\` with an inline literal schema becomes a native ` +
      `struct, so a schema declared inside a component body / function, or a \`*Field\` helper, emits as an unresolved ` +
      `reference and fails swiftc/kotlinc. Hoist the declaration to the top of the file (it reads no component state), ` +
      `or keep the call in a \`<Web>\`-only branch.`,
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
  apiVersion: 2,
  modules: ['@pyreon/validation'],
  scanModule(scan) {
    scanValidationBindings(scan)
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
    // `const a = zodSchema(…), b = zodSchema(…)`: the one-declarator recognizers below would decline it.
    const multi = lowerMultiDeclarator(node, ctx)
    if (multi !== undefined) return multi
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
  items: { schema: createSchemaItem({ declaredBy: 'zodSchema/valibotSchema/arktypeSchema' }) },
  methodCalls: { '*': recognizeValidationMethodCall },
  exprs: { safeParse: safeParseExpr },
  finishModule: finishValidation,
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
        'a TOP-LEVEL `const X = zodSchema(z.object({ … }))` DOES lower — it emits a native struct with parse/safeParse, and `X.safeParse(v)` / `zodSchema(z.object({ … })).safeParse(v)` lower to the web\'s `{ success, data }` result (several schemas may share one `const a = …, b = …` statement). What stays web-only: `.parse()` (throws), a schema declared inside a component body (hoist it), a non-literal schema argument, `.refine` / `.transform` / `.default` / `.preprocess` chains (named per field), `standardSchemaToValidator` and the async validate path',
    },
  },
}
