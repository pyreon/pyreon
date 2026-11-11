import type { VNodeChild } from '@pyreon/core'
import { useIntersection } from '@pyreon/hooks'
import { kinetic } from '@pyreon/kinetic'
import { computed } from '@pyreon/reactivity'
import { motion } from '../theme'

const ease = `${motion.reveal.duration}ms ${motion.reveal.easing}`

const RevealBox = kinetic('div')
  .enter({ opacity: 0, transform: `translateY(${motion.reveal.distance}px)` })
  .enterTo({ opacity: 1, transform: 'none' })
  .enterTransition(`opacity ${ease}, transform ${ease}`)

/**
 * `.rv` → `.rv.on` — fades a section up the first time it scrolls into view.
 * kinetic keeps the content in the prerendered HTML (hidden-state classes
 * inlined on the server) and skips the motion under
 * `prefers-reduced-motion`. Only opacity and transform animate, never layout.
 */
export function Reveal(props: { children?: VNodeChild }) {
  let node: HTMLElement | null = null
  const entry = useIntersection(() => node, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' })
  // Latches: once seen, stays shown (scrolling back up does not hide it).
  let seen = false
  const show = computed(() => {
    if (seen) return true
    seen = entry()?.isIntersecting === true
    return seen
  })
  return (
    <RevealBox ref={(n: HTMLElement | null) => {
            node = n
          }} show={() => show()}>
      {props.children}
    </RevealBox>
  )
}
