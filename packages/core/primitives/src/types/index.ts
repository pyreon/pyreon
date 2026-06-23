// Public type-only exports for all 16 canonical primitives.
//
// Per-primitive implementations (web in src/web/) import from these.
// iOS/Android targets: PMTC compiler intercepts JSX at compile-time
// and emits platform-native code — these types are only the contract
// at the source-level, not invoked at native runtime.

export type {
  AccessibilityProps,
  Align,
  BaseLayoutProps,
  ChildrenProp,
  ColorToken,
  ColorTokens,
  Justify,
  Radius,
  Space,
  ValueOrSignal,
} from './shared'

export type { InlineProps, LayerProps, ScrollProps, SpacerProps, StackProps } from './layout'
export type { HeadingProps, IconProps, ImageProps, TextProps } from './content'
export type { ButtonProps, LinkProps, PressProps } from './interaction'
export type { FieldProps, ModalProps, ToggleProps } from './input'
