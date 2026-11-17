import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { font, layout, leading, text } from '../theme'
import { tone as toneOf, txt } from './bases'

/**
 * The note family: the small quiet line that qualifies what is above it. A
 * caveat under a benchmark number, the run condition, a footnote, a
 * figure's caption, the "checked on" line under a comparison, a hint under
 * a live tile. One block of text, fog by default, no outer margin: the
 * parent's `Stack` gap (or a `Box padTop`) sets the space above it.
 *
 * Sizes:
 * - `caveat`: mono at `text.caveat` (11.5px, .01em). Every caveat, condition and footnote. [A8]
 *   Wrapped `balance` (no line ends on an orphan word; `pretty` left one): through `data-caveat` and
 *   the global wrap rules in `site-css.ts`, because the unlayered `:where(p){text-wrap-style:pretty}`
 *   there outranks any layered component rule. Pass `keepRanges(text)` (`kit/stat.tsx`)
 *   as children so a number range ("2.5–8.7×") never breaks at its dash.
 * - `mono`: mono at `text.mono` (12px). A status line (a live tile's hint, "updated …").
 * - `caption`: sans at `text.caption` (12.5px). A caption under a figure or a fact.
 * - `ui`: sans at `text.ui` (13.5px). The explainer under a demo.
 * - `small`: sans at `text.small` (14.5px). A figure's caption at reading size.
 *
 * Callouts (a note in a box: `LimitNote`, `NextReleaseNote`) and the docs'
 * admonitions are cards, not notes.
 */

export type NoteSize = 'caveat' | 'mono' | 'caption' | 'ui' | 'small'
export type NoteTone = 'fog' | 'mist'
export type NoteLeading = keyof typeof leading
export type NoteTag = 'p' | 'span' | 'small' | 'figcaption' | 'div'

/** Each size's line height when the note does not set one. */
const DEFAULT_LEADING: Record<NoteSize, NoteLeading> = { caveat: 'relaxed', mono: 'normal', caption: 'normal', ui: 'relaxed', small: 'relaxed' }

const sizes = () => ({
  caveat: { fontFamily: font.mono, fontSize: text.caveat.size, letterSpacing: text.caveat.tracking },
  mono: { fontFamily: font.mono, fontSize: text.mono.size },
  caption: { fontFamily: font.sans, fontSize: text.caption.size },
  ui: { fontFamily: font.sans, fontSize: text.ui.size },
  small: { fontFamily: font.sans, fontSize: text.small.size },
})

const tones = (_t: unknown, m: Parameters<typeof toneOf>[0]) => ({
  fog: { color: toneOf(m, 'fog') },
  mist: { color: toneOf(m, 'mist') },
})

const leadings = () =>
  Object.fromEntries(Object.entries(leading).map(([k, v]) => [k, { lineHeight: v }])) as Record<NoteLeading, { lineHeight: number }>

// size → `variant`, tone → `state`, leading → `size`: the wrapper below is the public API.
const NoteBase = txt
  .config({ name: 'Note' })
  .attrs({ tag: 'p' })
  .theme(() => ({ display: 'block', margin: 0 }))
  .variants(sizes)
  .states(tones)
  .sizes(leadings)
  .multiple(() => ({ measure: { maxWidth: layout.noteMeasure } }))

export interface NoteProps {
  /** Default `caveat`. */
  size?: NoteSize | undefined
  /** Default `fog`. */
  tone?: NoteTone | undefined
  /** Default per size: `relaxed` (1.6) for caveat / ui / small, `normal` (1.5) for mono / caption. */
  leading?: NoteLeading | undefined
  /** Cap the line length (`layout.noteMeasure`) when the note sits under a full-width block. */
  measure?: boolean | undefined
  /** Default `p`. */
  tag?: NoteTag | undefined
  id?: string | undefined
  children?: VNodeChild
}

/** A quiet line of text under what it qualifies. */
export function Note(props: NoteProps) {
  const size = props.size ?? 'caveat'
  return h(
    NoteBase,
    {
      tag: props.tag ?? 'p',
      variant: size,
      state: props.tone ?? 'fog',
      size: props.leading ?? DEFAULT_LEADING[size],
      multiple: props.measure ? ['measure'] : [],
      id: props.id,
      'data-caveat': size === 'caveat' ? '' : undefined,
    },
    props.children,
  )
}
