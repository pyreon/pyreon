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
  ReactivityKind,
  ReactivityBinding,
  CheckStatus,
  VerifyCheck,
  VerifyVerdict,
  ComponentIntelligence,
  CatalogGraphData,
} from './types'

export type { PropType, PropShape } from './controls'
export { inferControl, inferControls } from './controls'

export type { ScenarioInit } from './scenario'
export { slugify, scenarioId, makeScenario } from './scenario'

export { buildVariantMatrix, variantLabel, autoVariantScenarios } from './variants'

export type { CatalogGraph } from './graph'
export { createCatalogGraph } from './graph'
