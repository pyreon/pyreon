// @pyreon/compiler — JSX reactive transform for Pyreon

export type { CompilerWarning, TransformResult } from "./jsx"
export { transformJSX } from "./jsx"

export type {
  ErrorDiagnosis,
  MigrationChange,
  MigrationResult,
  ReactDiagnostic,
  ReactDiagnosticCode,
} from "./react-intercept"
export {
  detectReactPatterns,
  diagnoseError,
  hasReactPatterns,
  migrateReactCode,
} from "./react-intercept"
