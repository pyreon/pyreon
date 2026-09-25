/**
 * `@pyreon/lathe/core` — the pure pipeline, with no CLI and no filesystem.
 *
 * Importable by a build plugin, a test, or another tool that wants the IR
 * without shelling out.
 */
export type {
  HttpMethod,
  IrDocument,
  IrErrorResponse,
  IrField,
  IrModel,
  IrNote,
  IrNoteCode,
  IrNoteSeverity,
  IrOperation,
  IrPagination,
  IrParam,
  IrSecurityScheme,
  IrType,
  IrWebhook,
  Reach,
  StringFormat,
} from './core/ir'
export { NOTE_SEVERITY, noteSeverity } from './core/ir'
export {
  ALL_PLUGINS,
  DEFAULT_PLUGINS,
  resolveConfig,
  resolveProjects,
  type LatheProject,
  type LatheSection,
  type PaginationConfig,
  type PluginName,
  type ResolvedConfig,
} from './core/config'
export { generate, type GenerateResult, type GeneratedFile } from './core/generate'
export { loadOpenApi, openApiVersionProblem, type LoadOptions } from './input/openapi'
export { parseSpecText, parseYaml, YamlError } from './input/yaml'
export {
  classifyWarning,
  resolveNativeCompiler,
  resolveTransform,
  verifyNative,
  worstVerdict,
  type CompileFn,
  type DeclarationVerdict,
  type FileVerdict,
  type NativeCompilers,
  type WarningClass,
  type Verdict,
  type VerifyReport,
} from './verify/lower'
