/**
 * `@pyreon/lathe/core` — the pure pipeline, with no CLI and no filesystem.
 *
 * Importable by a build plugin, a test, or another tool that wants the IR
 * without shelling out.
 */
export type {
  HttpMethod,
  IrDocument,
  IrField,
  IrModel,
  IrNote,
  IrOperation,
  IrParam,
  IrSecurityScheme,
  IrType,
  Reach,
  StringFormat,
} from './core/ir'
export {
  ALL_PLUGINS,
  DEFAULT_PLUGINS,
  resolveConfig,
  resolveProjects,
  type LatheProject,
  type LatheSection,
  type PluginName,
  type ResolvedConfig,
} from './core/config'
export { generate, type GenerateResult, type GeneratedFile } from './core/generate'
export { loadOpenApi } from './input/openapi'
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
