/**
 * `@pyreon/validation/native-plugin` — the schema adapters' native lowering.
 *
 * `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/validation`. Tooling-only — nothing here is reachable from the web entry points.
 *
 * The schema model is exported for `@pyreon/validate`'s plugin, which lowers the same struct from the `s` DSL
 * and registers these pieces under its own plugin name rather than depending on this plugin being loaded.
 */
export { validationPlugin, validationPlugin as default } from './native-plugin/plugin'
export {
  tryNamespacedSchemaDefnFromTopLevel,
} from './native-plugin/recognize'
export {
  createSchemaItem,
  createSchemaStructRefinement,
  SCHEMA_ITEM_TYPE,
  schemaItemSpec,
  schemaOf,
} from './native-plugin/schema'
export type { UrlRule, ZodFieldConstraints, ZodFieldType, ZodSchemaDefnIR } from './native-plugin/ir'
