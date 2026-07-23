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

// design-system building blocks (build the showcased components on these)
export { el, rs, txt } from './ui/bases'
export { cx, type InputEl, type T } from './ui/kit'
export {
  type BrandTheme,
  hexToRgba,
  THEMES,
  type ThemeTokens,
  tokens,
} from './ui/theme'
