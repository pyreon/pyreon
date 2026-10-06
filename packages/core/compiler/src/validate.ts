// `@pyreon/compiler/validate` — the @pyreon/validate static analyzer + emitters
// behind the vite-plugin's `optimizeValidators` / `compileValidators` options.
// Parses with the TypeScript compiler API, so it is NOT in the main entry.
export { analyzeValidate, emitSchemaSource, emitValidator, isEmittable } from './validate-emit'
export type {
  NumberCheck,
  SchemaSourceResult,
  StringCheck,
  ValidateField,
  ValidateNode,
  ValidateSchemaInfo,
} from './validate-emit'
