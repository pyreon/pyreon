import type { VNodeChild } from '@pyreon/core'
import { keyframes } from '@pyreon/styler'
import { motion } from '../theme'
import { el } from './bases'

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(${motion.reveal.distance}px); }
  to { opacity: 1; transform: none; }
`

const reveal = `
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      animation: ${fadeUp} linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 35%;
    }
  }
`

const RevealBox = el.config({ name: 'Reveal' }).attrs({ block: true, contentAlignX: 'block' }).theme(() => ({ extendCss: reveal }))

/**
 * `.rv` — a section fades up as it scrolls into view. [A12]
 *
 * Pure CSS (a scroll-driven animation), so it costs no JavaScript and works on
 * static pages: content above the fold is already past the animation's range
 * and renders in place, nothing is ever hidden while waiting for a script, and
 * browsers without `animation-timeline` (or with reduced motion) show the
 * section as is. Only opacity and transform animate, never layout.
 */
export function Reveal(props: { children?: VNodeChild }) {
  return <RevealBox>{props.children}</RevealBox>
}
