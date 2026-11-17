import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { media, type MediaWidth } from '../../theme'
import { el } from '../bases'

/**
 * Show a block only from a width up (`from`), or only below one (`below`).
 * The widths are the theme breakpoints (`sm` 576, `md` 768, `lg` 992,
 * `xl` 1200) and `split` (700, `layout.split`). CSS only: both versions are
 * in the HTML, the other one is `display: none`, so a static page needs no
 * script and assistive tech skips the hidden one.
 */
export type VisibleProps =
  | { from: MediaWidth; below?: undefined; children?: VNodeChild }
  | { below: MediaWidth; from?: undefined; children?: VNodeChild }

const WIDTHS = ['sm', 'md', 'lg', 'xl', 'split'] as const satisfies readonly MediaWidth[]

/** One variant per (direction, width): `from-md` hides below md, `below-md` hides from md. */
const variants = () =>
  Object.fromEntries(
    WIDTHS.flatMap((w) => [
      [`from-${w}`, { extendCss: `${media.down[w]} { display: none; }` }],
      [`below-${w}`, { extendCss: `${media.up[w]} { display: none; }` }],
    ]),
  ) as Record<`${'from' | 'below'}-${MediaWidth}`, { extendCss: string }>

const VisibleBase = el.config({ name: 'Visible' }).attrs({ block: true }).variants(variants)

export function Visible(props: VisibleProps) {
  const variant = props.from === undefined ? (`below-${props.below}` as const) : (`from-${props.from}` as const)
  return h(VisibleBase, { variant }, props.children)
}
