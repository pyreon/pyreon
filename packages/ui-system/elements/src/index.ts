import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/elements
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

import { Provider } from '@pyreon/unistyle'

export type { ElementProps, PyreonElement } from './Element'
export { Element } from './Element'
export type {
  ChildrenProps as IteratorChildrenProps,
  ElementType,
  ExtendedProps,
  LooseProps as IteratorLooseProps,
  MaybeNull,
  ObjectProps as IteratorObjectProps,
  ObjectValue,
  Props as IteratorProps,
  PropsCallback,
  SimpleProps as IteratorSimpleProps,
  SimpleValue,
} from './helpers/Iterator'
export { default as Iterator } from './helpers/Iterator'
export type { ListProps } from './List'
export { List } from './List'
export type { OverlayProps, UseOverlayProps } from './Overlay'
export { Overlay, OverlayProvider, useOverlay } from './Overlay'
export type { PortalProps } from './Portal'
export { Portal } from './Portal'
export type { TextProps } from './Text'
export { Text } from './Text'
export type {
  AlignX,
  AlignY,
  Content,
  ContentBoolean,
  Direction,
  ExtendCss,
  InnerRef,
  PyreonStatic,
  Responsive,
  ResponsiveBoolType,
} from './types'
export type { UtilProps } from './Util'
export { Util } from './Util'

export { Provider }
