import { isEmpty } from '@pyreon/ui-core'

export type AlignContentDirectionKeys = keyof typeof ALIGN_CONTENT_DIRECTION
export type AlignContentAlignXKeys = keyof typeof ALIGN_CONTENT_MAP_X
export type AlignContentAlignYKeys = keyof typeof ALIGN_CONTENT_MAP_Y

const ALIGN_CONTENT_MAP_SHARED = {
  center: 'center',
  spaceBetween: 'space-between',
  spaceAround: 'space-around',
  // coolgrid's ContentAlignX advertised spaceEvenly from inception, but the
  // map lacked the entry — `contentAlignX="spaceEvenly"` silently emitted
  // `justify-content: undefined` (dropped). Typed-but-unimplemented class.
  spaceEvenly: 'space-evenly',
  block: 'stretch',
}

export const ALIGN_CONTENT_MAP_X = {
  left: 'flex-start',
  right: 'flex-end',
  ...ALIGN_CONTENT_MAP_SHARED,
} as const

export const ALIGN_CONTENT_MAP_Y = {
  top: 'flex-start',
  bottom: 'flex-end',
  ...ALIGN_CONTENT_MAP_SHARED,
} as const

export const ALIGN_CONTENT_DIRECTION = {
  inline: 'row',
  reverseInline: 'row-reverse',
  rows: 'column',
  reverseRows: 'column-reverse',
} as const

// Each field is optional — the function body's first check
// (`if (...!direction || !alignX || !alignY) return null`) already treats
// any falsy/undefined input as a no-op. Aligning the type with the runtime
// contract lets typed-theme callers (e.g. `MakeItResponsiveStyles<ThemeProps>`
// where ThemeProps fields are optional to match the per-breakpoint resolved
// scalar shape) pass values through without redundant casts.
export type AlignContent = ({
  direction,
  alignX,
  alignY,
}: {
  direction?: AlignContentDirectionKeys | undefined
  alignX?: AlignContentAlignXKeys | undefined
  alignY?: AlignContentAlignYKeys | undefined
}) => string | null

const alignContent: AlignContent = (attrs) => {
  const { direction, alignX, alignY } = attrs

  if (isEmpty(attrs) || !direction || !alignX || !alignY) {
    return null
  }

  // Direct comparisons avoid the per-call 2-element array allocation that
  // `['inline', 'reverseInline'].includes(direction)` paid. Hot path: fires
  // for every styled component with a `direction` prop. Ported from
  // vitus-labs `e573e6c4`.
  const isReverted = direction === 'inline' || direction === 'reverseInline'
  const dir = ALIGN_CONTENT_DIRECTION[direction]
  const x = ALIGN_CONTENT_MAP_X[alignX]
  const y = ALIGN_CONTENT_MAP_Y[alignY]

  return `flex-direction: ${dir}; align-items: ${isReverted ? y : x}; justify-content: ${isReverted ? x : y};`
}

export default alignContent
