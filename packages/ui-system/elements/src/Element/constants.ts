/** Props consumed by Element that should not be forwarded to the underlying DOM node. */
export const RESERVED_PROPS = [
  'innerRef',
  'tag',
  'block',
  'label',
  'children',
  'beforeContent',
  'afterContent',

  'equalCols',
  'vertical',
  'direction',
  'alignX',
  'alignY',

  'css',
  'contentCss',
  'beforeContentCss',
  'afterContentCss',

  'contentDirection',
  'contentAlignX',
  'contentAlignY',

  'beforeContentDirection',
  'beforeContentAlignX',
  'beforeContentAlignY',

  'afterContentDirection',
  'afterContentAlignX',
  'afterContentAlignY',
] as const

/**
 * HTML tags that are inline-level by default. When Element renders one of
 * these tags, child Content wrappers use `span` instead of `div` to
 * preserve valid HTML nesting.
 */
export const INLINE_ELEMENTS = {
  span: true,
  a: true,
  button: true,
  input: true,
  label: true,
  select: true,
  textarea: true,
  br: true,
  img: true,
  strong: true,
  small: true,
  code: true,
  b: true,
  big: true,
  i: true,
  tt: true,
  abbr: true,
  acronym: true,
  cite: true,
  dfn: true,
  em: true,
  kbd: true,
  samp: true,
  var: true,
  bdo: true,
  map: true,
  object: true,
  q: true,
  script: true,
  sub: true,
  sup: true,
}

/**
 * HTML void/self-closing elements that cannot have children. When Element
 * detects one of these tags, it skips rendering beforeContent/content/afterContent
 * and returns the Wrapper alone.
 */
export const EMPTY_ELEMENTS = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  keygen: true,
  link: true,
  textarea: true,
  // 'meta': true,
  // 'param': true,
  source: true,
  track: true,
  wbr: true,
}
