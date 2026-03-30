import type { InnerTheme } from './types'

type EdgeProperty =
  | 'inset'
  | 'margin'
  | 'padding'
  | 'border-width'
  | 'border-style'
  | 'border-color'

type EdgeKeys = {
  full: keyof InnerTheme
  x: keyof InnerTheme
  y: keyof InnerTheme
  top: keyof InnerTheme
  left: keyof InnerTheme
  bottom: keyof InnerTheme
  right: keyof InnerTheme
}

type BorderRadiusKeys = {
  full: keyof InnerTheme
  top: keyof InnerTheme
  bottom: keyof InnerTheme
  left: keyof InnerTheme
  right: keyof InnerTheme
  topLeft: keyof InnerTheme
  topRight: keyof InnerTheme
  bottomLeft: keyof InnerTheme
  bottomRight: keyof InnerTheme
}

export type PropertyDescriptor =
  | { kind: 'simple'; css: string; key: keyof InnerTheme }
  | { kind: 'convert'; css: string; key: keyof InnerTheme }
  | { kind: 'convert_fallback'; css: string; keys: (keyof InnerTheme)[] }
  | { kind: 'edge'; property: EdgeProperty; keys: EdgeKeys }
  | { kind: 'border_radius'; keys: BorderRadiusKeys }
  | { kind: 'special'; id: string }

const propertyMap: PropertyDescriptor[] = [
  // SPECIAL: fullScreen
  { kind: 'special', id: 'fullScreen' },

  // POSITION
  { kind: 'simple', css: 'all', key: 'all' },
  { kind: 'simple', css: 'display', key: 'display' },
  { kind: 'simple', css: 'position', key: 'position' },
  { kind: 'simple', css: 'box-sizing', key: 'boxSizing' },
  { kind: 'simple', css: 'float', key: 'float' },

  // INSET
  {
    kind: 'edge',
    property: 'inset',
    keys: {
      full: 'inset',
      x: 'insetX',
      y: 'insetY',
      top: 'top',
      left: 'left',
      bottom: 'bottom',
      right: 'right',
    },
  },

  // SIZING
  { kind: 'convert_fallback', css: 'width', keys: ['width', 'size'] },
  { kind: 'convert_fallback', css: 'min-width', keys: ['minWidth', 'minSize'] },
  { kind: 'convert_fallback', css: 'max-width', keys: ['maxWidth', 'maxSize'] },
  { kind: 'convert_fallback', css: 'height', keys: ['height', 'size'] },
  { kind: 'convert_fallback', css: 'min-height', keys: ['minHeight', 'minSize'] },
  { kind: 'convert_fallback', css: 'max-height', keys: ['maxHeight', 'maxSize'] },
  { kind: 'convert', css: 'gap', key: 'gap' },
  { kind: 'simple', css: 'aspect-ratio', key: 'aspectRatio' },
  { kind: 'simple', css: 'contain', key: 'contain' },
  { kind: 'simple', css: 'container-type', key: 'containerType' },
  { kind: 'simple', css: 'container-name', key: 'containerName' },
  { kind: 'simple', css: 'container', key: 'container' },
  { kind: 'convert', css: 'inline-size', key: 'inlineSize' },
  { kind: 'convert', css: 'block-size', key: 'blockSize' },
  { kind: 'convert', css: 'min-inline-size', key: 'minInlineSize' },
  { kind: 'convert', css: 'min-block-size', key: 'minBlockSize' },
  { kind: 'convert', css: 'max-inline-size', key: 'maxInlineSize' },
  { kind: 'convert', css: 'max-block-size', key: 'maxBlockSize' },

  // SPACING
  {
    kind: 'edge',
    property: 'margin',
    keys: {
      full: 'margin',
      x: 'marginX',
      y: 'marginY',
      top: 'marginTop',
      left: 'marginLeft',
      bottom: 'marginBottom',
      right: 'marginRight',
    },
  },
  {
    kind: 'edge',
    property: 'padding',
    keys: {
      full: 'padding',
      x: 'paddingX',
      y: 'paddingY',
      top: 'paddingTop',
      left: 'paddingLeft',
      bottom: 'paddingBottom',
      right: 'paddingRight',
    },
  },

  // Logical spacing
  { kind: 'convert', css: 'margin-inline', key: 'marginInline' },
  { kind: 'convert', css: 'margin-inline-start', key: 'marginInlineStart' },
  { kind: 'convert', css: 'margin-inline-end', key: 'marginInlineEnd' },
  { kind: 'convert', css: 'margin-block', key: 'marginBlock' },
  { kind: 'convert', css: 'margin-block-start', key: 'marginBlockStart' },
  { kind: 'convert', css: 'margin-block-end', key: 'marginBlockEnd' },
  { kind: 'convert', css: 'padding-inline', key: 'paddingInline' },
  { kind: 'convert', css: 'padding-inline-start', key: 'paddingInlineStart' },
  { kind: 'convert', css: 'padding-inline-end', key: 'paddingInlineEnd' },
  { kind: 'convert', css: 'padding-block', key: 'paddingBlock' },
  { kind: 'convert', css: 'padding-block-start', key: 'paddingBlockStart' },
  { kind: 'convert', css: 'padding-block-end', key: 'paddingBlockEnd' },

  // Logical inset
  { kind: 'convert', css: 'inset-inline', key: 'insetInline' },
  { kind: 'convert', css: 'inset-inline-start', key: 'insetInlineStart' },
  { kind: 'convert', css: 'inset-inline-end', key: 'insetInlineEnd' },
  { kind: 'convert', css: 'inset-block', key: 'insetBlock' },
  { kind: 'convert', css: 'inset-block-start', key: 'insetBlockStart' },
  { kind: 'convert', css: 'inset-block-end', key: 'insetBlockEnd' },

  // FLEX
  { kind: 'simple', css: 'align-content', key: 'alignContent' },
  { kind: 'simple', css: 'align-items', key: 'alignItems' },
  { kind: 'simple', css: 'align-self', key: 'alignSelf' },
  { kind: 'simple', css: 'flex', key: 'flex' },
  { kind: 'simple', css: 'flex-basis', key: 'flexBasis' },
  { kind: 'simple', css: 'flex-direction', key: 'flexDirection' },
  { kind: 'simple', css: 'flex-flow', key: 'flexFlow' },
  { kind: 'simple', css: 'flex-grow', key: 'flexGrow' },
  { kind: 'simple', css: 'flex-shrink', key: 'flexShrink' },
  { kind: 'simple', css: 'flex-wrap', key: 'flexWrap' },
  { kind: 'simple', css: 'justify-content', key: 'justifyContent' },
  { kind: 'simple', css: 'justify-items', key: 'justifyItems' },
  { kind: 'simple', css: 'justify-self', key: 'justifySelf' },
  { kind: 'simple', css: 'place-items', key: 'placeItems' },
  { kind: 'simple', css: 'place-content', key: 'placeContent' },
  { kind: 'simple', css: 'place-self', key: 'placeSelf' },
  { kind: 'convert', css: 'row-gap', key: 'rowGap' },
  { kind: 'convert', css: 'column-gap', key: 'columnGap' },

  // GRID
  { kind: 'simple', css: 'grid', key: 'grid' },
  { kind: 'simple', css: 'grid-area', key: 'gridArea' },
  { kind: 'convert', css: 'grid-auto-columns', key: 'gridAutoColumns' },
  { kind: 'simple', css: 'grid-auto-flow', key: 'gridAutoFlow' },
  { kind: 'convert', css: 'grid-auto-rows', key: 'gridAutoRows' },
  { kind: 'simple', css: 'grid-column', key: 'gridColumn' },
  { kind: 'simple', css: 'grid-column-end', key: 'gridColumnEnd' },
  { kind: 'convert', css: 'grid-column-gap', key: 'gridColumnGap' },
  { kind: 'convert', css: 'grid-column-start', key: 'gridColumnStart' },
  { kind: 'convert', css: 'grid-gap', key: 'gridGap' },
  { kind: 'simple', css: 'grid-row', key: 'gridRow' },
  { kind: 'simple', css: 'grid-row-start', key: 'gridRowStart' },
  { kind: 'simple', css: 'grid-row-end', key: 'gridRowEnd' },
  { kind: 'convert', css: 'grid-row-gap', key: 'gridRowGap' },
  { kind: 'simple', css: 'grid-template', key: 'gridTemplate' },
  { kind: 'simple', css: 'grid-template-areas', key: 'gridTemplateAreas' },
  { kind: 'simple', css: 'grid-template-columns', key: 'gridTemplateColumns' },
  { kind: 'simple', css: 'grid-template-rows', key: 'gridTemplateRows' },

  // POSITIONING
  { kind: 'simple', css: 'object-fit', key: 'objectFit' },
  { kind: 'simple', css: 'object-position', key: 'objectPosition' },
  { kind: 'simple', css: 'order', key: 'order' },
  { kind: 'simple', css: 'opacity', key: 'opacity' },
  { kind: 'simple', css: 'resize', key: 'resize' },
  { kind: 'simple', css: 'vertical-align', key: 'verticalAlign' },

  // FONT & TEXT
  { kind: 'simple', css: 'line-height', key: 'lineHeight' },
  { kind: 'simple', css: 'font', key: 'font' },
  { kind: 'simple', css: 'font-family', key: 'fontFamily' },
  { kind: 'convert', css: 'font-size', key: 'fontSize' },
  { kind: 'convert', css: 'font-size-adjust', key: 'fontSizeAdjust' },
  { kind: 'convert', css: 'font-stretch', key: 'fontStretch' },
  { kind: 'simple', css: 'font-style', key: 'fontStyle' },
  { kind: 'simple', css: 'font-variant', key: 'fontVariant' },
  { kind: 'simple', css: 'font-weight', key: 'fontWeight' },
  { kind: 'simple', css: 'font-kerning', key: 'fontKerning' },
  { kind: 'simple', css: 'font-feature-settings', key: 'fontFeatureSettings' },
  { kind: 'simple', css: 'font-variation-settings', key: 'fontVariationSettings' },
  { kind: 'simple', css: 'font-optical-sizing', key: 'fontOpticalSizing' },
  { kind: 'simple', css: 'text-align', key: 'textAlign' },
  { kind: 'simple', css: 'text-align-last', key: 'textAlignLast' },
  { kind: 'simple', css: 'text-transform', key: 'textTransform' },
  { kind: 'simple', css: 'text-decoration', key: 'textDecoration' },
  { kind: 'simple', css: 'text-decoration-color', key: 'textDecorationColor' },
  { kind: 'simple', css: 'text-decoration-line', key: 'textDecorationLine' },
  { kind: 'simple', css: 'text-decoration-style', key: 'textDecorationStyle' },
  { kind: 'simple', css: 'text-decoration-thickness', key: 'textDecorationThickness' },
  { kind: 'simple', css: 'text-underline-offset', key: 'textUnderlineOffset' },
  { kind: 'simple', css: 'text-emphasis', key: 'textEmphasis' },
  { kind: 'simple', css: 'text-emphasis-color', key: 'textEmphasisColor' },
  { kind: 'simple', css: 'text-emphasis-style', key: 'textEmphasisStyle' },
  { kind: 'simple', css: 'letter-spacing', key: 'letterSpacing' },
  { kind: 'simple', css: 'word-spacing', key: 'wordSpacing' },
  { kind: 'simple', css: 'text-indent', key: 'textIndent' },
  { kind: 'simple', css: 'text-justify', key: 'textJustify' },
  { kind: 'simple', css: 'text-overflow', key: 'textOverflow' },
  { kind: 'simple', css: 'text-shadow', key: 'textShadow' },
  { kind: 'simple', css: 'text-wrap', key: 'textWrap' },
  { kind: 'simple', css: 'text-rendering', key: 'textRendering' },
  { kind: 'simple', css: 'white-space', key: 'whiteSpace' },
  { kind: 'simple', css: 'word-break', key: 'wordBreak' },
  { kind: 'simple', css: 'word-wrap', key: 'wordWrap' },
  { kind: 'simple', css: 'writing-mode', key: 'writingMode' },
  { kind: 'simple', css: 'direction', key: 'direction' },
  { kind: 'simple', css: 'hyphens', key: 'hyphens' },

  // LIST
  { kind: 'simple', css: 'list-style', key: 'listStyle' },
  { kind: 'simple', css: 'list-style-image', key: 'listStyleImage' },
  { kind: 'simple', css: 'list-style-position', key: 'listStylePosition' },
  { kind: 'simple', css: 'list-style-type', key: 'listStyleType' },

  // BACKGROUND & COLORS
  { kind: 'simple', css: 'color', key: 'color' },
  { kind: 'simple', css: 'background', key: 'background' },
  { kind: 'simple', css: 'background-color', key: 'backgroundColor' },
  { kind: 'special', id: 'backgroundImage' },
  { kind: 'simple', css: 'background-attachment', key: 'backgroundAttachment' },
  { kind: 'simple', css: 'background-clip', key: 'backgroundClip' },
  { kind: 'simple', css: 'background-origin', key: 'backgroundOrigin' },
  { kind: 'simple', css: 'background-position', key: 'backgroundPosition' },
  { kind: 'simple', css: 'background-repeat', key: 'backgroundRepeat' },
  { kind: 'simple', css: 'background-size', key: 'backgroundSize' },

  // BORDERS
  {
    kind: 'border_radius',
    keys: {
      full: 'borderRadius',
      top: 'borderRadiusTop',
      bottom: 'borderRadiusBottom',
      left: 'borderRadiusLeft',
      right: 'borderRadiusRight',
      topLeft: 'borderRadiusTopLeft',
      topRight: 'borderRadiusTopRight',
      bottomLeft: 'borderRadiusBottomLeft',
      bottomRight: 'borderRadiusBottomRight',
    },
  },
  { kind: 'simple', css: 'border', key: 'border' },
  { kind: 'simple', css: 'border-top', key: 'borderTop' },
  { kind: 'simple', css: 'border-bottom', key: 'borderBottom' },
  { kind: 'simple', css: 'border-left', key: 'borderLeft' },
  { kind: 'simple', css: 'border-right', key: 'borderRight' },
  {
    kind: 'edge',
    property: 'border-width',
    keys: {
      full: 'borderWidth',
      x: 'borderWidthX',
      y: 'borderWidthY',
      top: 'borderWidthTop',
      left: 'borderWidthLeft',
      bottom: 'borderWidthBottom',
      right: 'borderWidthRight',
    },
  },
  {
    kind: 'edge',
    property: 'border-style',
    keys: {
      full: 'borderStyle',
      x: 'borderStyleX',
      y: 'borderStyleY',
      top: 'borderStyleTop',
      left: 'borderStyleLeft',
      bottom: 'borderStyleBottom',
      right: 'borderStyleRight',
    },
  },
  {
    kind: 'edge',
    property: 'border-color',
    keys: {
      full: 'borderColor',
      x: 'borderColorX',
      y: 'borderColorY',
      top: 'borderColorTop',
      left: 'borderColorLeft',
      bottom: 'borderColorBottom',
      right: 'borderColorRight',
    },
  },
  { kind: 'simple', css: 'border-image', key: 'borderImage' },
  { kind: 'simple', css: 'border-image-outset', key: 'borderImageOutset' },
  { kind: 'simple', css: 'border-image-repeat', key: 'borderImageRepeat' },
  { kind: 'simple', css: 'border-image-slice', key: 'borderImageSlice' },
  { kind: 'simple', css: 'border-image-source', key: 'borderImageSource' },
  { kind: 'simple', css: 'border-image-width', key: 'borderImageWidth' },
  { kind: 'simple', css: 'border-spacing', key: 'borderSpacing' },

  // Logical borders
  { kind: 'simple', css: 'border-inline', key: 'borderInline' },
  { kind: 'simple', css: 'border-block', key: 'borderBlock' },
  { kind: 'simple', css: 'border-inline-start', key: 'borderInlineStart' },
  { kind: 'simple', css: 'border-inline-end', key: 'borderInlineEnd' },
  { kind: 'simple', css: 'border-block-start', key: 'borderBlockStart' },
  { kind: 'simple', css: 'border-block-end', key: 'borderBlockEnd' },

  // VISUAL EFFECTS
  { kind: 'simple', css: 'backface-visibility', key: 'backfaceVisibility' },
  { kind: 'simple', css: 'box-shadow', key: 'boxShadow' },
  { kind: 'simple', css: 'filter', key: 'filter' },
  { kind: 'simple', css: 'backdrop-filter', key: 'backdropFilter' },
  { kind: 'simple', css: 'mix-blend-mode', key: 'mixBlendMode' },
  { kind: 'simple', css: 'background-blend-mode', key: 'backgroundBlendMode' },
  { kind: 'simple', css: 'isolation', key: 'isolation' },
  { kind: 'simple', css: 'outline', key: 'outline' },
  { kind: 'simple', css: 'outline-color', key: 'outlineColor' },
  { kind: 'simple', css: 'outline-offset', key: 'outlineOffset' },
  { kind: 'simple', css: 'outline-style', key: 'outlineStyle' },
  { kind: 'simple', css: 'outline-width', key: 'outlineWidth' },

  // ANIMATIONS
  { kind: 'special', id: 'animation' },
  { kind: 'simple', css: 'animation-name', key: 'animationName' },
  { kind: 'simple', css: 'animation-duration', key: 'animationDuration' },
  { kind: 'simple', css: 'animation-timing-function', key: 'animationTimingFunction' },
  { kind: 'simple', css: 'animation-delay', key: 'animationDelay' },
  { kind: 'simple', css: 'animation-iteration-count', key: 'animationIterationCount' },
  { kind: 'simple', css: 'animation-direction', key: 'animationDirection' },
  { kind: 'simple', css: 'animation-fill-mode', key: 'animationFillMode' },
  { kind: 'simple', css: 'animation-play-state', key: 'animationPlayState' },
  { kind: 'simple', css: 'transition', key: 'transition' },
  { kind: 'simple', css: 'transition-delay', key: 'transitionDelay' },
  { kind: 'simple', css: 'transition-duration', key: 'transitionDuration' },
  { kind: 'simple', css: 'transition-property', key: 'transitionProperty' },
  { kind: 'simple', css: 'transition-timing-function', key: 'transitionTimingFunction' },

  // TRANSFORM
  { kind: 'simple', css: 'transform', key: 'transform' },
  { kind: 'simple', css: 'transform-origin', key: 'transformOrigin' },
  { kind: 'simple', css: 'transform-style', key: 'transformStyle' },
  { kind: 'simple', css: 'translate', key: 'translate' },
  { kind: 'simple', css: 'rotate', key: 'rotate' },
  { kind: 'simple', css: 'scale', key: 'scale' },
  { kind: 'simple', css: 'will-change', key: 'willChange' },

  // SCROLL
  { kind: 'simple', css: 'scroll-behavior', key: 'scrollBehavior' },
  { kind: 'simple', css: 'scroll-snap-type', key: 'scrollSnapType' },
  { kind: 'simple', css: 'scroll-snap-align', key: 'scrollSnapAlign' },
  { kind: 'simple', css: 'scroll-snap-stop', key: 'scrollSnapStop' },
  { kind: 'simple', css: 'scroll-margin', key: 'scrollMargin' },
  { kind: 'simple', css: 'scroll-padding', key: 'scrollPadding' },
  { kind: 'simple', css: 'overscroll-behavior', key: 'overscrollBehavior' },
  { kind: 'simple', css: 'overscroll-behavior-x', key: 'overscrollBehaviorX' },
  { kind: 'simple', css: 'overscroll-behavior-y', key: 'overscrollBehaviorY' },

  // INTERACTION
  { kind: 'simple', css: 'cursor', key: 'cursor' },
  { kind: 'simple', css: 'pointer-events', key: 'pointerEvents' },
  { kind: 'simple', css: 'user-select', key: 'userSelect' },
  { kind: 'simple', css: 'touch-action', key: 'touchAction' },
  { kind: 'simple', css: 'scrollbar-width', key: 'scrollbarWidth' },
  { kind: 'simple', css: 'scrollbar-color', key: 'scrollbarColor' },
  { kind: 'simple', css: 'scrollbar-gutter', key: 'scrollbarGutter' },
  { kind: 'simple', css: 'caret-color', key: 'caretColor' },
  { kind: 'simple', css: 'accent-color', key: 'accentColor' },
  { kind: 'simple', css: 'color-scheme', key: 'colorScheme' },

  // OTHER
  { kind: 'simple', css: 'caption-side', key: 'captionSide' },
  { kind: 'simple', css: 'clear', key: 'clear' },
  { kind: 'simple', css: 'clip', key: 'clip' },
  { kind: 'simple', css: 'clip-path', key: 'clipPath' },
  { kind: 'simple', css: 'content', key: 'content' },
  { kind: 'simple', css: 'content-visibility', key: 'contentVisibility' },
  { kind: 'simple', css: 'counter-increment', key: 'counterIncrement' },
  { kind: 'simple', css: 'counter-reset', key: 'counterReset' },
  { kind: 'simple', css: 'empty-cells', key: 'emptyCells' },
  { kind: 'simple', css: 'z-index', key: 'zIndex' },
  { kind: 'simple', css: 'overflow', key: 'overflow' },
  { kind: 'simple', css: 'overflow-wrap', key: 'overflowWrap' },
  { kind: 'simple', css: 'overflow-x', key: 'overflowX' },
  { kind: 'simple', css: 'overflow-y', key: 'overflowY' },
  { kind: 'simple', css: 'perspective', key: 'perspective' },
  { kind: 'simple', css: 'perspective-origin', key: 'perspectiveOrigin' },
  { kind: 'simple', css: 'quotes', key: 'quotes' },
  { kind: 'simple', css: 'tab-size', key: 'tabSize' },
  { kind: 'simple', css: 'table-layout', key: 'tableLayout' },
  { kind: 'simple', css: 'visibility', key: 'visibility' },
  { kind: 'simple', css: 'appearance', key: 'appearance' },
  { kind: 'simple', css: 'image-rendering', key: 'imageRendering' },

  // Masks
  { kind: 'simple', css: 'mask-image', key: 'maskImage' },
  { kind: 'simple', css: 'mask-size', key: 'maskSize' },
  { kind: 'simple', css: 'mask-position', key: 'maskPosition' },
  { kind: 'simple', css: 'mask-repeat', key: 'maskRepeat' },

  // Shapes
  { kind: 'simple', css: 'shape-outside', key: 'shapeOutside' },
  { kind: 'simple', css: 'shape-margin', key: 'shapeMargin' },
  { kind: 'simple', css: 'shape-image-threshold', key: 'shapeImageThreshold' },

  // Columns
  { kind: 'simple', css: 'column-count', key: 'columnCount' },
  { kind: 'simple', css: 'column-width', key: 'columnWidth' },
  { kind: 'simple', css: 'column-rule', key: 'columnRule' },
  { kind: 'simple', css: 'columns', key: 'columns' },

  // Fragmentation
  { kind: 'simple', css: 'break-before', key: 'breakBefore' },
  { kind: 'simple', css: 'break-after', key: 'breakAfter' },
  { kind: 'simple', css: 'break-inside', key: 'breakInside' },
  { kind: 'simple', css: 'orphans', key: 'orphans' },
  { kind: 'simple', css: 'widows', key: 'widows' },
  { kind: 'simple', css: 'print-color-adjust', key: 'printColorAdjust' },

  // CUSTOM ATTRIBUTES
  { kind: 'special', id: 'hideEmpty' },
  { kind: 'special', id: 'clearFix' },
  { kind: 'special', id: 'extendCss' },
]

export default propertyMap
