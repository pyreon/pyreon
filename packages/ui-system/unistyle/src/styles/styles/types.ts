type PropertyValue = string | number | null | undefined
type Color = string | null | undefined

export interface ITheme {
  // Special
  fullScreen?: boolean
  hideEmpty?: boolean
  clearFix?: boolean
  extendCss?: string | ((css: (...args: any[]) => string) => string)

  // Position
  all?: string
  display?: string
  position?: string
  boxSizing?: string
  float?: string

  // Inset
  inset?: PropertyValue
  insetX?: PropertyValue
  insetY?: PropertyValue
  top?: PropertyValue
  left?: PropertyValue
  bottom?: PropertyValue
  right?: PropertyValue

  // Sizing
  width?: PropertyValue
  minWidth?: PropertyValue
  maxWidth?: PropertyValue
  height?: PropertyValue
  minHeight?: PropertyValue
  maxHeight?: PropertyValue
  size?: PropertyValue
  minSize?: PropertyValue
  maxSize?: PropertyValue
  gap?: PropertyValue
  aspectRatio?: string
  contain?: string
  containerType?: string
  containerName?: string
  container?: string
  inlineSize?: PropertyValue
  blockSize?: PropertyValue
  minInlineSize?: PropertyValue
  minBlockSize?: PropertyValue
  maxInlineSize?: PropertyValue
  maxBlockSize?: PropertyValue

  // Spacing
  margin?: PropertyValue
  marginX?: PropertyValue
  marginY?: PropertyValue
  marginTop?: PropertyValue
  marginLeft?: PropertyValue
  marginBottom?: PropertyValue
  marginRight?: PropertyValue
  padding?: PropertyValue
  paddingX?: PropertyValue
  paddingY?: PropertyValue
  paddingTop?: PropertyValue
  paddingLeft?: PropertyValue
  paddingBottom?: PropertyValue
  paddingRight?: PropertyValue

  // Logical spacing
  marginInline?: PropertyValue
  marginInlineStart?: PropertyValue
  marginInlineEnd?: PropertyValue
  marginBlock?: PropertyValue
  marginBlockStart?: PropertyValue
  marginBlockEnd?: PropertyValue
  paddingInline?: PropertyValue
  paddingInlineStart?: PropertyValue
  paddingInlineEnd?: PropertyValue
  paddingBlock?: PropertyValue
  paddingBlockStart?: PropertyValue
  paddingBlockEnd?: PropertyValue

  // Logical inset
  insetInline?: PropertyValue
  insetInlineStart?: PropertyValue
  insetInlineEnd?: PropertyValue
  insetBlock?: PropertyValue
  insetBlockStart?: PropertyValue
  insetBlockEnd?: PropertyValue

  // Flex
  alignContent?: string
  alignItems?: string
  alignSelf?: string
  flex?: string | number
  flexBasis?: string | number
  flexDirection?: string
  flexFlow?: string
  flexGrow?: number
  flexShrink?: number
  flexWrap?: string
  justifyContent?: string
  justifyItems?: string
  justifySelf?: string
  placeItems?: string
  placeContent?: string
  placeSelf?: string
  rowGap?: PropertyValue
  columnGap?: PropertyValue

  // Grid
  grid?: string
  gridArea?: string
  gridAutoColumns?: PropertyValue
  gridAutoFlow?: string
  gridAutoRows?: PropertyValue
  gridColumn?: string
  gridColumnEnd?: string
  gridColumnGap?: PropertyValue
  gridColumnStart?: PropertyValue
  gridGap?: PropertyValue
  gridRow?: string
  gridRowStart?: string
  gridRowEnd?: string
  gridRowGap?: PropertyValue
  gridTemplate?: string
  gridTemplateAreas?: string
  gridTemplateColumns?: string
  gridTemplateRows?: string

  // Positioning
  objectFit?: string
  objectPosition?: string
  order?: number
  opacity?: number | string
  resize?: string
  verticalAlign?: string

  // Font & text
  lineHeight?: string | number
  font?: string
  fontFamily?: string
  fontSize?: PropertyValue
  fontSizeAdjust?: PropertyValue
  fontStretch?: PropertyValue
  fontStyle?: string
  fontVariant?: string
  fontWeight?: string | number
  fontKerning?: string
  fontFeatureSettings?: string
  fontVariationSettings?: string
  fontOpticalSizing?: string
  textAlign?: string
  textAlignLast?: string
  textTransform?: string
  textDecoration?: string
  textDecorationColor?: Color
  textDecorationLine?: string
  textDecorationStyle?: string
  textDecorationThickness?: string
  textUnderlineOffset?: string
  textEmphasis?: string
  textEmphasisColor?: Color
  textEmphasisStyle?: string
  letterSpacing?: string
  wordSpacing?: string
  textIndent?: string
  textJustify?: string
  textOverflow?: string
  textShadow?: string
  textWrap?: string
  textRendering?: string
  whiteSpace?: string
  wordBreak?: string
  wordWrap?: string
  writingMode?: string
  direction?: string
  hyphens?: string

  // List
  listStyle?: string
  listStyleImage?: string
  listStylePosition?: string
  listStyleType?: string

  // Background & colors
  color?: Color
  background?: string
  backgroundColor?: Color
  backgroundImage?: string
  backgroundAttachment?: string
  backgroundClip?: string
  backgroundOrigin?: string
  backgroundPosition?: string
  backgroundRepeat?: string
  backgroundSize?: string

  // Borders
  borderRadius?: PropertyValue
  borderRadiusTop?: PropertyValue
  borderRadiusBottom?: PropertyValue
  borderRadiusLeft?: PropertyValue
  borderRadiusRight?: PropertyValue
  borderRadiusTopLeft?: PropertyValue
  borderRadiusTopRight?: PropertyValue
  borderRadiusBottomLeft?: PropertyValue
  borderRadiusBottomRight?: PropertyValue
  border?: string
  borderTop?: string
  borderBottom?: string
  borderLeft?: string
  borderRight?: string
  borderWidth?: PropertyValue
  borderWidthX?: PropertyValue
  borderWidthY?: PropertyValue
  borderWidthTop?: PropertyValue
  borderWidthLeft?: PropertyValue
  borderWidthBottom?: PropertyValue
  borderWidthRight?: PropertyValue
  borderStyle?: string
  borderStyleX?: string
  borderStyleY?: string
  borderStyleTop?: string
  borderStyleLeft?: string
  borderStyleBottom?: string
  borderStyleRight?: string
  borderColor?: Color
  borderColorX?: Color
  borderColorY?: Color
  borderColorTop?: Color
  borderColorLeft?: Color
  borderColorBottom?: Color
  borderColorRight?: Color
  borderImage?: string
  borderImageOutset?: string
  borderImageRepeat?: string
  borderImageSlice?: string
  borderImageSource?: string
  borderImageWidth?: string
  borderSpacing?: string

  // Logical borders
  borderInline?: string
  borderBlock?: string
  borderInlineStart?: string
  borderInlineEnd?: string
  borderBlockStart?: string
  borderBlockEnd?: string

  // Visual effects
  backfaceVisibility?: string
  boxShadow?: string
  filter?: string
  backdropFilter?: string
  mixBlendMode?: string
  backgroundBlendMode?: string
  isolation?: string
  outline?: string
  outlineColor?: Color
  outlineOffset?: string
  outlineStyle?: string
  outlineWidth?: string

  // Animations
  keyframe?: string
  animation?: string
  animationName?: string
  animationDuration?: string
  animationTimingFunction?: string
  animationDelay?: string
  animationIterationCount?: string | number
  animationDirection?: string
  animationFillMode?: string
  animationPlayState?: string
  transition?: string
  transitionDelay?: string
  transitionDuration?: string
  transitionProperty?: string
  transitionTimingFunction?: string

  // Transform
  transform?: string
  transformOrigin?: string
  transformStyle?: string
  translate?: string
  rotate?: string
  scale?: string | number
  willChange?: string

  // Scroll
  scrollBehavior?: string
  scrollSnapType?: string
  scrollSnapAlign?: string
  scrollSnapStop?: string
  scrollMargin?: string
  scrollPadding?: string
  overscrollBehavior?: string
  overscrollBehaviorX?: string
  overscrollBehaviorY?: string

  // Interaction
  cursor?: string
  pointerEvents?: string
  userSelect?: string
  touchAction?: string
  scrollbarWidth?: string
  scrollbarColor?: string
  scrollbarGutter?: string
  caretColor?: Color
  accentColor?: Color
  colorScheme?: string

  // Other
  captionSide?: string
  clear?: string
  clip?: string
  clipPath?: string
  content?: string
  contentVisibility?: string
  counterIncrement?: string
  counterReset?: string
  emptyCells?: string
  zIndex?: number | string
  overflow?: string
  overflowWrap?: string
  overflowX?: string
  overflowY?: string
  perspective?: string
  perspectiveOrigin?: string
  quotes?: string
  tabSize?: string | number
  tableLayout?: string
  visibility?: string
  appearance?: string
  imageRendering?: string

  // Masks
  maskImage?: string
  maskSize?: string
  maskPosition?: string
  maskRepeat?: string

  // Shapes
  shapeOutside?: string
  shapeMargin?: string
  shapeImageThreshold?: string | number

  // Columns
  columnCount?: number | string
  columnWidth?: string
  columnRule?: string
  columns?: string

  // Fragmentation
  breakBefore?: string
  breakAfter?: string
  breakInside?: string
  orphans?: number
  widows?: number
  printColorAdjust?: string
}

export type InnerTheme = {
  [K in keyof ITheme]?: ITheme[K] | null | undefined
}

export type Theme = {
  [K in keyof InnerTheme]?: InnerTheme[K] | (() => ITheme[K])
}
