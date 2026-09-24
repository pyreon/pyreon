/**
 * `@pyreon/atlas/ui` — the standalone Atlas component workbench.
 *
 * Mount `<Workbench catalog={…}>` and hand it a `WorkbenchCatalog`: a flat list
 * of components, each with control metadata + a `render(props)`. The example
 * writes one by hand; the `atlas dev` CLI generates one from a project's
 * discovered components. The `el`/`txt` bases + theme helpers are re-exported so
 * you can build the showcased components on the same rocketstyle design system.
 */
export { Workbench, type WorkbenchProps } from './ui/Workbench'

// canvas addons — the Storybook-inspired tools (viewport / backgrounds /
// pseudo-states / outline), exported as DATA so a host can render its own
// toolbar against the same presets the built-in panel uses.
export {
  ADDON_TABS,
  type AddonTab,
  type AddonTabId,
  BACKGROUND_VARIANT,
  type BackgroundId,
  type BackgroundPreset,
  BACKGROUNDS,
  backgroundCss,
  type LocaleId,
  localeById,
  localeDir,
  type LocalePreset,
  LOCALES,
  OUTLINE_CSS,
  type PseudoId,
  type PseudoPreset,
  PSEUDO_STATES,
  pseudoProps,
  VIEWPORT_SIZE,
  type ViewportId,
  type ViewportPreset,
  VIEWPORTS,
  viewportById,
  viewportWidth,
} from './ui/addons'
export {
  buildSearch,
  type CatalogGroup,
  componentById,
  defaultValues,
  groupComponents,
  type WorkbenchCatalog,
  type WorkbenchComponent,
  type WorkbenchControl,
  type WorkbenchRenderCtx,
} from './ui/catalog'

// design-system building blocks (build the showcased components on these).
//
// `rs`/`el`/`txt` are bound to Atlas's token type via rocketstyle's
// `withTheme<ThemeTokens>()`, so a catalog built on them gets a typed, CHECKED
// `t` in every `.theme()` / dimension callback — with no global `ThemeDefault`
// augmentation (which would merge into, and silently corrupt, the `t` of any app
// that also loads @pyreon/ui-theme; see ./ui/theme).
export { el, rs, txt } from './ui/bases'
export { cx, type InputEl, type T } from './ui/kit'
export {
  type BrandTheme,
  hexToRgba,
  THEMES,
  type ThemeTokens,
  tokens,
} from './ui/theme'
