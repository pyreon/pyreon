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

/**
 * NOTE — there is deliberately no `panel` field on `AtlasPlugin`.
 *
 * An earlier cut declared `panel?: PanelDescriptor` ({ id, title }) so a plugin
 * could "contribute a UI panel". Nothing ever read it and no built-in plugin
 * set it: a promise the code did not keep, and the kind of typed-but-
 * unimplemented surface that reads as a feature until someone sets it and
 * wonders why nothing renders.
 *
 * It was also the wrong layer. These plugins are the CATALOG pipeline — they
 * run under `atlas scan` in Node, must stay DOM-free, and know nothing about a
 * rendered workbench. The addon panel is a UI concern with its own registry:
 * `ADDON_TABS` + the presets in `../ui/addons`, which the panel renders FROM
 * (so adding a tab there is a data entry, not a shell change).
 *
 * If pipeline plugins ever need to surface their own panel, the seam is a
 * UI-side map from plugin name → renderer, NOT a DOM type smuggled into this
 * contract.
 */
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
}
