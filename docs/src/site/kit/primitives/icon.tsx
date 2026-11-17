import type { VNodeChild } from '@pyreon/core'

/**
 * A UI icon: an inline SVG at a fixed pixel size, drawn on a `box`×`box`
 * viewBox (default 16). Say what it is for: `aria-label` names it (an image),
 * `aria-hidden="true"` marks it decorative (the text beside it says it all).
 * Plain markup with no styling runtime, like `Glyph` (product glyphs from the
 * sprite).
 */
export type IconProps = { size: number; box?: number | undefined; children?: VNodeChild } & (
  | { 'aria-label': string; 'aria-hidden'?: undefined }
  | { 'aria-hidden': 'true'; 'aria-label'?: undefined }
)

export function Icon(props: IconProps) {
  const box = props.box ?? 16
  const label = props['aria-label']
  if (label !== undefined) {
    return (
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline SVG cannot be an <img>; role="img" + aria-label is how it gets a name
      <svg width={props.size} height={props.size} viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label}>
        {props.children}
      </svg>
    )
  }

  return (
    <svg width={props.size} height={props.size} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
      {props.children}
    </svg>
  )
}
