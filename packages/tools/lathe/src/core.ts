/**
 * `@pyreon/lathe/core` — the pure pipeline, with no CLI and no filesystem.
 *
 * Importable by a build plugin, a test, or another tool that wants the IR
 * without shelling out.
 */
export type {
  BodyEncoding,
  HttpMethod,
  IrArrayType,
  IrBody,
  IrDocument,
  IrField,
  IrFieldEncoding,
  IrLiteral,
  IrModel,
  IrModelSource,
  IrNote,
  IrNoteCode,
  IrNoteSeverity,
  IrNumberType,
  IrOperation,
  IrOperationSource,
  IrPagination,
  IrParam,
  IrSecurityScheme,
  IrStringType,
  IrType,
  IrValidateMode,
  Reach,
  StringFormat,
} from './core/ir'
// The plugin API: `definePlugin`, its hook contexts, and the building blocks
// the built-in emitters use — the writer, the identifier rules, the walkers.
export {
  definePlugin,
  isLathePlugin,
  type LathePlugin,
  type LathePluginEmitContext,
  type LathePluginFile,
  type LathePluginSetupContext,
  type LathePluginTransformContext,
} from './core/plugin'
export { SourceFile, banner, jsonLiteral, q, relativeSpecifier, safeBlockComment, safeLineComment } from './emit/writer'
export { camel, hookOf, ident, kebab, modelIdent, operationIdent, pascal, propKey, tagFile, typeIdent } from './core/naming'
export { byCodeUnit } from './core/order'
export { childTypes, collectRefNames, operationTypes, renameRefs } from './core/walk'
export { byTag } from './emit/client'
export type { LatheFilters, LatheHttpMethod, LatheOperationMatcher } from './core/select'
export type { LatheSpecPatch } from './core/patch'
export type {
  LatheFileNameContext,
  LatheHookNameContext,
  LatheModelNameContext,
  LatheNaming,
  LatheOperationNameContext,
  LatheOperationSettings,
} from './core/customize'
export { formatFiles, type LatheFormatter } from './core/format'
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
