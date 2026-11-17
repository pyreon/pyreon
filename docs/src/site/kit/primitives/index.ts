/**
 * Layer 1 of the site design system: layout and text primitives. Pages and
 * kit components compose these instead of defining their own stacks, rows,
 * grids, mono captions and show/hide blocks. Contract and when to use which:
 * `.agents/guides/ui-system/site-design-system.md` ("Primitives").
 */
export { Box } from './box'
export type { BoxProps } from './box'
export { Cluster } from './cluster'
export type { ClusterProps } from './cluster'
export type { LayoutTag } from './shared'
export { Stack } from './stack'
export type { StackProps } from './stack'
export { AutoGrid } from './auto-grid'
export type { AutoGridProps } from './auto-grid'
export { Grid } from './grid'
export type { GridProps } from './grid'
export type { GridTag } from './grid-shared'
export { Icon } from './icon'
export type { A11yProps, AlignX, AlignY, Breakpoint, Responsive } from './space'
export { Text } from './text'
export type { TextLeading, TextProps, TextTag, TextTone, TextVariant } from './text'
export { Visible } from './visible'
export type { VisibleProps } from './visible'
export { Wrap } from './wrap'
