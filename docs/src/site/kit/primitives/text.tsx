import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { font, leading, text } from '../../theme'
import { tone as toneOf, txt } from '../bases'

/**
 * Running text in one of the site's text variants. Display type is `Heading`,
 * copy paragraphs are `Lede` and the uppercase section label is `Eyebrow`
 * (`kit/type.tsx`); `Text` is the small inline and block text pages used to
 * style for themselves: a mono caption, a tracked label, a line of body copy.
 *
 * A variant sets family and size only. Without `tone` the colour is inherited;
 * without `leading` the line height is the Text element's own (1).
 */

/** mono: `text.mono` (12px) mono · label: the eyebrow's uppercase tracked mono · caption / small / body: sans at `text.caption` / `text.small` / `text.body`. */
export type TextVariant = 'mono' | 'label' | 'caption' | 'small' | 'body'
/** The text colours from `theme.ts` `color`. */
export type TextTone = 'fog' | 'mist' | 'text' | 'strong' | 'accent' | 'accentText'
export type TextLeading = keyof typeof leading
export type TextTag = 'span' | 'p' | 'div' | 'b' | 'strong' | 'em' | 'small' | 'code' | 'li' | 'dt' | 'dd' | 'figcaption'

const variants = () => ({
  mono: { fontFamily: font.mono, fontSize: text.mono.size },
  label: { fontFamily: font.mono, fontSize: text.eyebrow.size, letterSpacing: text.eyebrow.tracking, textTransform: 'uppercase' },
  caption: { fontFamily: font.sans, fontSize: text.caption.size },
  small: { fontFamily: font.sans, fontSize: text.small.size },
  body: { fontFamily: font.sans, fontSize: text.body.size },
})

const tones = (_t: unknown, m: Parameters<typeof toneOf>[0]) => ({
  fog: { color: toneOf(m, 'fog') },
  mist: { color: toneOf(m, 'mist') },
  text: { color: toneOf(m, 'text') },
  strong: { color: toneOf(m, 'strong') },
  accent: { color: toneOf(m, 'accent') },
  accentText: { color: toneOf(m, 'accentText') },
})

const leadings = () =>
  Object.fromEntries(Object.entries(leading).map(([k, v]) => [k, { lineHeight: v }])) as Record<TextLeading, { lineHeight: number }>

const textFlags = () => ({
  block: { display: 'block' },
  anywhere: { overflowWrap: 'anywhere' },
})

// variant → `variant`, tone → `state`, leading → `size`, flags → `multiple`: the
// wrapper below is the public API, rocketstyle's dimension names stay inside.
const TextBase = txt.config({ name: 'Text' }).attrs({ tag: 'span' }).variants(variants).states(tones).sizes(leadings).multiple(textFlags)

export interface TextProps {
  variant: TextVariant
  tone?: TextTone | undefined
  leading?: TextLeading | undefined
  /** Render as a block (its own line) instead of inline. */
  block?: boolean | undefined
  /** Break long unspaced strings (package names, paths) anywhere instead of overflowing. */
  anywhere?: boolean | undefined
  tag?: TextTag | undefined
  id?: string | undefined
  'aria-hidden'?: 'true' | undefined
  children?: VNodeChild
}

export function Text(props: TextProps) {
  const flags: ('block' | 'anywhere')[] = []
  if (props.block) flags.push('block')
  if (props.anywhere) flags.push('anywhere')

  return h(
    TextBase,
    {
      tag: props.tag ?? 'span',
      variant: props.variant,
      state: props.tone,
      size: props.leading,
      multiple: flags,
      id: props.id,
      'aria-hidden': props['aria-hidden'],
    },
    props.children,
  )
}
