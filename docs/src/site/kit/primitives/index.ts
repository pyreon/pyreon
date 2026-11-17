/**
 * Layer 1 of the site design system: layout and text primitives. Pages and
 * kit components compose these instead of defining their own stacks, rows,
 * grids, mono captions and show/hide blocks. Contract and when to use which:
 * `.agents/guides/ui-system/site-design-system.md` ("Primitives").
 */
export { Box, Cluster, Stack } from './box'
export type { BoxProps, ClusterProps, LayoutTag, StackProps } from './box'
export { AutoGrid, Grid } from './grid'
export type { AutoGridProps, GridProps, GridTag } from './grid'
export { Icon } from './icon'
export type { A11yProps, AlignX, AlignY, Breakpoint, Responsive } from './space'
export { Text } from './text'
export type { TextLeading, TextProps, TextTag, TextTone, TextVariant } from './text'
export { Visible } from './visible'
export type { VisibleProps } from './visible'
export { Wrap } from './wrap'
