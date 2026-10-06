// `@pyreon/native-compiler/audit` — the multiplatform (PMTC) project audit and
// snippet detector. Deliberately a SEPARATE entry from the main one: it needs
// only `oxc-parser` + the web-only package map, not the emitters, so `pyreon
// doctor --check-native` and the MCP `validate` tool can load it without
// pulling the Swift/Kotlin compiler into their graph.
export type {
  NativeAuditResult,
  NativeFinding,
  NativeFindingCode,
  NativeLocation,
  NativePatternDiagnostic,
} from './native-audit'
export { auditNative, detectNativePatterns } from './native-audit'
