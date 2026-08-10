/**
 * `@pyreon/atlas/core` — the framework-agnostic domain model + pure engine
 * (types, control inference, variant matrix, scenarios, the Catalog Graph).
 * No DOM, no framework, no plugins — everything above builds on this.
 */
export type {
  ComponentRef,
  ControlKind,
  PropControl,
  VariantAxis,
  ScenarioSource,
  Scenario,
  PlayContext,
  PlayFn,
  CheckKey,
  CheckStatus,
  FindingCode,
  VerifyCheck,
  VerifyFinding,
  VerifyVerdict,
  ComponentIntelligence,
  CatalogGraphData,
} from './types'
export { CHECK_KEYS, finding } from './types'

export type { PropType, PropShape } from './controls'
export { inferControl, inferControls } from './controls'

export type { ScenarioInit } from './scenario'
export { slugify, scenarioId, makeScenario } from './scenario'

export { buildVariantMatrix, variantLabel, autoVariantScenarios } from './variants'

export type { AtlasExtension } from './extension'
export {
  defineExtension,
  resolveExtensions,
  validateExtension,
  validateExtensions,
} from './extension'
export type { UsageFinding, UsageResult } from './validate-usage'
export { editDistance, formatUsage, nearest, validateUsage } from './validate-usage'
export type { ComponentIdentity } from './identity'
export { ambiguousComponentMessage, componentKey, fileQualifierFor, pathQualifierFor, resolveComponent } from './identity'
export type { CatalogGraph, SearchHit } from './graph'
export { createCatalogGraph } from './graph'
