import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { space, type SpaceKey } from '../../theme'
import { el } from '../bases'
import { type A11yProps, type AlignX, type AlignY, type Breakpoint, type Responsive, spacePx } from './space'

/**
 * Box, Stack and Cluster: the site's flex layout primitives, on the kit's `el`
 * base (`@pyreon/elements` Element), so they emit the same CSS a hand-written
 * `el.config(…).attrs({ block, contentDirection, gap, … })` did.
 *
 * Contract (every primitive in this folder):
 *   - no outer margin: space between siblings is the parent's `gap`;
 *   - gap and padding take `space` keys (`theme.ts`), never pixels;
 *   - layout props are read once, when the primitive renders (static layout).
 */

/** What a layout primitive may render as. A `ul` / `ol` drops its bullets and its default indent. */
export type LayoutTag = 'div' | 'section' | 'article' | 'aside' | 'header' | 'footer' | 'nav' | 'figure' | 'ul' | 'ol' | 'li' | 'p' | 'dl'

interface LayoutProps extends A11yProps {
  /** The element (default `div`). */
  tag?: LayoutTag | undefined
  /** Shrink-wrap the content (inline-flex) instead of taking the full width. */
  inline?: boolean | undefined
  /** May shrink below its content's width (`min-width: 0`): a column of a grid or a flex row that holds code or long words. */
  shrink?: boolean | undefined
  /** Align itself to the start of its parent's cross axis (`align-self: start`), instead of stretching. */
  selfStart?: boolean | undefined
  children?: VNodeChild
}

/** Flags every layout primitive shares (rocketstyle's multi-value `multiple` dimension). */
const layoutFlags = () => ({
  shrink: { minWidth: 0 },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  selfStart: { alignSelf: 'start' },
  wrap: { flexWrap: 'wrap' },
})

type Flag = keyof ReturnType<typeof layoutFlags>

function flagsOf(p: LayoutProps, extra: readonly Flag[] = []): Flag[] {
  const out: Flag[] = [...extra]
  if (p.shrink) out.push('shrink')
  if (p.selfStart) out.push('selfStart')
  if (p.tag === 'ul' || p.tag === 'ol') out.push('list')

  return out
}

/** The attributes a primitive hands to its element unchanged. */
function passThrough(p: LayoutProps) {
  return {
    tag: p.tag ?? 'div',
    block: !p.inline,
    id: p.id,
    role: p.role,
    'aria-label': p['aria-label'],
    'aria-labelledby': p['aria-labelledby'],
    'aria-hidden': p['aria-hidden'],
  }
}

const BoxBase = el.config({ name: 'Box' }).multiple(layoutFlags)
const StackBase = el.config({ name: 'Stack' }).multiple(layoutFlags)
const ClusterBase = el.config({ name: 'Cluster' }).multiple(layoutFlags)

type Padding = Responsive<SpaceKey>

export interface BoxProps extends LayoutProps {
  /** Padding on every side. */
  pad?: Padding | undefined
  /** Left and right padding (wins over `pad`). */
  padX?: Padding | undefined
  /** Top and bottom padding (wins over `pad`). */
  padY?: Padding | undefined
  /** Top padding (wins over `pad` and `padY`). */
  padTop?: Padding | undefined
  /** Bottom padding (wins over `pad` and `padY`). */
  padBottom?: Padding | undefined
}

const SIDES = [
  ['pad', ['top', 'right', 'bottom', 'left']],
  ['padY', ['top', 'bottom']],
  ['padX', ['left', 'right']],
  ['padTop', ['top']],
  ['padBottom', ['bottom']],
] as const

/** Per-breakpoint padding declarations; within a breakpoint the more specific prop comes last and wins. */
export function paddingCss(p: BoxProps): Partial<Record<Breakpoint, string>> | undefined {
  const out: Partial<Record<Breakpoint, string>> = {}
  for (const [prop, sides] of SIDES) {
    const value = p[prop]
    if (value === undefined) continue
    const perBp: Partial<Record<Breakpoint, SpaceKey>> = typeof value === 'number' ? { xs: value } : value
    for (const bp of Object.keys(perBp) as Breakpoint[]) {
      const step = perBp[bp]
      if (step === undefined) continue
      out[bp] = (out[bp] ?? '') + sides.map((s) => `padding-${s}:${space[step]}px;`).join('')
    }
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * A block with padding from the space scale, and nothing else: its children
 * stretch to its width and stack without a gap (use `Stack` for a gap).
 */
export function Box(props: BoxProps) {
  return h(BoxBase, { ...passThrough(props), contentAlignX: 'block', multiple: flagsOf(props), css: paddingCss(props) }, props.children)
}

export interface StackProps extends LayoutProps {
  /** Space between the children (a `space` key, or one per breakpoint). */
  gap?: Responsive<SpaceKey> | undefined
  /** Horizontal alignment of the children: `block` (default) stretches them to the stack's width. */
  alignX?: AlignX | undefined
  /** Vertical distribution when the stack is taller than its content (Element's default: `center`). */
  alignY?: AlignY | undefined
}

/** Children in a column with a gap between them. */
export function Stack(props: StackProps) {
  return h(
    StackBase,
    {
      ...passThrough(props),
      contentDirection: 'rows',
      contentAlignX: props.alignX ?? 'block',
      contentAlignY: props.alignY,
      gap: props.gap === undefined ? undefined : spacePx(props.gap),
      multiple: flagsOf(props),
    },
    props.children,
  )
}

export interface ClusterProps extends LayoutProps {
  /** Space between the children, across and between lines. */
  gap?: Responsive<SpaceKey> | undefined
  /** Horizontal distribution of the children (default `left`). */
  alignX?: AlignX | undefined
  /** Vertical alignment of the children in a line (Element's default: `center`). */
  alignY?: AlignY | undefined
  /** Keep the children on one line (default: they wrap). */
  nowrap?: boolean | undefined
}

/** Children in a row that wraps onto more lines, with one gap between them. */
export function Cluster(props: ClusterProps) {
  return h(
    ClusterBase,
    {
      ...passThrough(props),
      contentDirection: 'inline',
      contentAlignX: props.alignX,
      contentAlignY: props.alignY,
      gap: props.gap === undefined ? undefined : spacePx(props.gap),
      multiple: flagsOf(props, props.nowrap ? [] : ['wrap']),
    },
    props.children,
  )
}
