/**
 * The Atlas plugin contract. Every built-in capability (variant-matrix
 * generation, a11y, reactivity-lens, coverage, visual-regression, theme, i18n,
 * Storybook compat) ships as a plugin on this same API — the extension surface
 * is the product, not an afterthought.
 *
 * A plugin contributes to one or more pipeline stages:
 *   discover → decorate → verify → graph
 */
import type { CatalogGraph, ComponentIntelligence, Scenario, VerifyVerdict } from '../core'

export interface DiscoverContext {
  /** the working directory Atlas was pointed at */
  readonly cwd: string
}

export interface DecorateContext {
  /** the working directory Atlas was pointed at */
  readonly cwd: string
}

export interface VerifyContext {
  readonly scenario: Scenario
  readonly component: ComponentIntelligence
}

export interface GraphContext {
  readonly graph: CatalogGraph
}

/** A UI panel a plugin contributes (design-owned surface, typed here). */
export interface PanelDescriptor {
  id: string
  title: string
}

export interface AtlasPlugin {
  /** unique plugin name */
  name: string
  /** contribute components (discovery stage) */
  discover?(ctx: DiscoverContext): ComponentIntelligence[] | Promise<ComponentIntelligence[]>
  /** enrich a component — add scenarios, controls, tags, reactivity (decorate stage) */
  decorate?(
    ci: ComponentIntelligence,
    ctx: DecorateContext,
  ): ComponentIntelligence | Promise<ComponentIntelligence>
  /** verify one scenario — return the checks this plugin owns (verify stage) */
  verify?(ctx: VerifyContext): Partial<VerifyVerdict> | Promise<Partial<VerifyVerdict>>
  /** run once against the fully-assembled graph (graph stage) */
  graph?(ctx: GraphContext): void | Promise<void>
  /** a UI panel this plugin contributes */
  panel?: PanelDescriptor
}
