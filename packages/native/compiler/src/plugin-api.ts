/**
 * `@pyreon/native-compiler/plugin-api` — everything a package-owned compiler
 * plugin may import from the compiler, and nothing else.
 *
 * A library ships its native lowering as a plugin in its OWN package. The plugin
 * reads the compiler through the `EmitContext` / `ParseContext` facades and the
 * IR types, and may use the few pure helpers the emitters themselves use to
 * spell target text. It must NOT reach the parser or the emitters: this entry is
 * the whole contract, so a plugin built against it keeps working when the
 * internals move.
 *
 * Type-only exports cost a plugin nothing at runtime; the value exports are the
 * protocol version plus a handful of pure functions.
 */

export { NATIVE_COMPILER_PLUGIN_API_V2, NATIVE_COMPILER_PLUGIN_API_VERSION } from './plugin'
export type {
  CompilerBackend,
  CompilerContext,
  CompilerModule,
  CompilerOptions,
  CompilerPass,
  CompilerPlugin,
  ServiceSpec,
  WebHostContext,
  WebHostFile,
} from './plugin'
export { retagHostedWebView } from './hosted-webview'
export type { HostedWebViewSpec } from './hosted-webview'
export type { BundleWebHostOptions } from './web-host-bundle'

export type * from './types'
export type {
  ComponentInfo,
  EmitContext,
  EmitBinding,
  EmitFieldValidators,
  EmitTarget,
  HostStateSlot,
  KotlinEmitContext,
  MemberEmitScope,
  StaticAttrValue,
  StatementEmitOptions,
  StructRegistry,
  SwiftEmitContext,
  WebViewFacade,
} from './emit-context'
export type {
  AliasDeclSpec,
  AstNode,
  CallRecognizer,
  ComputedDeclSpec,
  DeclCallRecognizer,
  DeclCallSite,
  DeclConstructRecognizer,
  DeclConstructSite,
  DeclVerdict,
  SignalDeclSpec,
  SignalSpec,
  CallSite,
  DeclEmitter,
  DeclValueBinding,
  DeclLifecycle,
  DeclSwiftInit,
  ExtDeclSpec,
  MemberCallLowering,
  MemberCallSite,
  ParseContext,
} from './call-lowering'
export type { ElementLowering, RetagContext } from './element-lowering'
export type {
  ExprEmitter,
  ExtExprIR,
  ExtExprSpec,
  ExtItemSpec,
  FieldValidators,
  ItemBindings,
  CallExprRecognizer,
  CallExprSite,
  MethodCallRecognizer,
  MethodCallSite,
  ModuleFinish,
  ModuleFinishTarget,
  ModuleItemEmitter,
  ModuleItemTyping,
  ModuleParseContext,
  ModuleReceiverLowering,
  ModuleReceiverSite,
  StructRefinement,
  StructRefinementTarget,
  TopLevelRecognizer,
} from './module-items'
export type {
  JsxElementRewrite,
  JsxRewriteContext,
  ModuleScan,
  ModuleScanner,
  RequestOptions,
  RequestSource,
  ResolvedRequest,
} from './module-scan'
export type {
  ParseRefinement,
  ParseRefinementTarget,
  PropsTypeContext,
  PropsTypeResolver,
} from './parse-extensions'
export type {
  CallExprIR,
  EmitPreparation,
  EmitPreparationInput,
  EmitPreparationResult,
  FunctionLowering,
  FunctionSite,
  IdentifierLowering,
  IntrinsicLowering,
  RefModifierLowering,
  MemberExprIR,
  MemberReadLowering,
  ReceiverAssignSite,
  ReceiverLowering,
  ReceiverSite,
  ReceiverTargetLowering,
} from './expr-lowering'
export type { ScopeEnterContext, ScopeProvider } from './scope-provider'
export type {
  KotlinPersistedSignal,
  PersistedSignalSite,
  SignalPersistence,
} from './signal-persistence'
export type { StubAugmentation, ValidateOptions } from './stub-augmentation'
export type { UnloweredSpec } from './unlowered-modules'
export type { ServiceDescriptor } from './services'
export type { PluginScope } from './plugin-scope'

export {
  dynamicKeyText,
  hasDynamicKey,
  isNullishLiteral,
  literalScalar,
  propName,
  readEntryNodes,
  readJsonLiteral,
  readLiteralEntries,
  readObjectProp,
  staticPropKey,
  topLevelDeclarators,
  unwrapTypeLayers,
} from './plugin-ast'
export { forEachExpr } from './expr-walk'
export { unconsumedSlotWarning } from './jsx-slot-attrs'
export { isNumericLiteralOrNegation, substituteIdentifier } from './expr-utils'
export { classifyHeaderValue, headerValueProblem, sendableHeaderExprs, type HeaderValue } from './request-headers'
export { kotlinIdent, kotlinMember, localBase, swiftIdent } from './identifier-safety'
export { KOTLIN_INT, swiftCodingKeysLines } from './spelling'
export { kotlinStr, swiftStr } from './string-literals'

export { isCanonicalPrimitive } from './canonical-primitives'
export { isStyleBasePrimitive } from './registry-lookup'
export { DEFAULT_THEME, resolveThemeToken, type ThemeTable } from './theme-native'
export type { StyleIR, StyleProperty, StyleValue } from './emit-style'
