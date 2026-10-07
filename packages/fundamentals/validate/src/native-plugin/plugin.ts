import { NATIVE_COMPILER_PLUGIN_API_VERSION, type CallRecognizer, type CompilerPlugin } from '@pyreon/native-compiler/plugin-api'
import { createSchemaItem, createSchemaStructRefinement } from '@pyreon/validation/native-plugin'
import { fieldMetaItem, safeParseExpr } from './exprs'
import { FIELD_META_ITEM_TYPE, finishValidate, recognizeMethodCall, recognizeTopLevel } from './recognize'
import { VALIDATE_PLUGIN_NAME } from './names'
import { scanValidate } from './scan'

export { VALIDATE_PLUGIN_NAME }

/**
 * The Tier-2 diagnostic for a `withField` call the recognizer did not lower (a non-literal meta object, a call
 * inside a component body): the setup call would emit as an unresolved reference. It CLAIMS the call (`null`),
 * so the binding does not fall through to a generic emit either.
 */
const tier2: CallRecognizer = (call, ctx) => {
  const bindingName = ctx.declName
  ctx.report(
    `${call.callee}() declared (@pyreon/validate, binding: \`${bindingName}\`) — Tier-2 package on native: parser ` +
      `recognition + runtime port not yet shipped. Setup function will not run on iOS/Android; downstream ` +
      `uses of \`${bindingName}\` emit as unresolved references and may fail swiftc/kotlinc validation. ` +
      `Use a per-target adapter (Layer 4: <NativeIOS> / <NativeAndroid>) to provide the same surface natively, ` +
      `or keep this code in a \`<Web>\`-only branch. Tracked in audit Gap 4; see ` +
      `docs/src/content/docs/multiplatform-libraries.md → "Tier 2 — pure-logic packages."`,
  )
  return null
}

/**
 * The `@pyreon/validate` native plugin: the `s` DSL's top-level `s.object({…})` / `s.discriminatedUnion(…)`
 * lowers to the same native struct `@pyreon/validation`'s adapters do (the model, emitters, form validators and
 * response-type evidence are `@pyreon/validation/native-plugin`'s, registered here under THIS plugin's name so
 * the plugin is self-sufficient), `withField(schema, meta)` lowers to a metadata struct, and
 * `Pet.safeParse(x)` / an inline `s.object({…}).safeParse(x)` lower to a result whose `.success` / `.data` read
 * like the web's.
 *
 * It declares no `requires`: an app that declares `@pyreon/validate` always has `@pyreon/validation` installed
 * (a dependency), but the compiler discovers plugins from an app's DECLARED dependencies, so a `requires` would
 * fail to load for an app that does not name both.
 */
export const validatePlugin: CompilerPlugin = {
  name: VALIDATE_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/validate'],
  scanModule: scanValidate,
  topLevel: recognizeTopLevel,
  items: { schema: createSchemaItem(), [FIELD_META_ITEM_TYPE]: fieldMetaItem },
  methodCalls: { '*': recognizeMethodCall },
  exprs: { safeParse: safeParseExpr },
  refineStructs: createSchemaStructRefinement(VALIDATE_PLUGIN_NAME),
  finishModule: finishValidate,
  // Every recognizer here only CLAIMS the call (`null`) and declares nothing, so there is no declaration type to emit.
  calls: { withField: tier2 },
  decls: {},
  unlowered: {
    '@pyreon/validate': {
      advice:
        "the `s` validator runtime is web-only — validate in a `<Web>` branch, or hand-roll the checks the native form needs",
    },
  },
}
