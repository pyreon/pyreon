import type { ClassTransitionProps, StyleTransitionProps } from './types'
import { addClasses, removeClasses } from './utils'

/**
 * Puts `el` straight into the END state of an enter or leave, with no
 * animation — what the reduced-motion branch of every transition renderer
 * applies.
 *
 * **Why:** reduced motion skips the animation, not its result. The
 * initially-hidden render inlines the hidden state (`leaveTo ?? enterFrom`
 * classes, `leaveToStyle ?? enterStyle` style) so SSR/SSG output carries the
 * content; on the animated path `applyEnter` clears that and lands on
 * `enterTo` / `enterToStyle`. The reduced-motion branch used to fire the
 * callbacks and complete the state machine without touching the element, so
 * a scroll-reveal stayed at `opacity: 0` forever for exactly the users who
 * asked for less motion.
 *
 * The end state matches the animated path's: enter keeps the `enterTo`
 * classes and `enterToStyle`; leave keeps the `leaveTo` classes and
 * `leaveToStyle`. The phase classes (`enter`, `leave`, `*From`) and the
 * from-styles are never applied — they only exist to animate. No
 * `transition` is set and no frame is scheduled.
 */
export const applyReducedMotionEnd = (
  el: HTMLElement,
  stage: string,
  config: ClassTransitionProps & StyleTransitionProps,
): void => {
  if (stage === 'entering') {
    removeClasses(el, config.leave)
    removeClasses(el, config.leaveFrom)
    removeClasses(el, config.leaveTo)
    removeClasses(el, config.enter)
    removeClasses(el, config.enterFrom)
    addClasses(el, config.enterTo)
    if (config.enterToStyle) Object.assign(el.style, config.enterToStyle)
  } else if (stage === 'leaving') {
    removeClasses(el, config.enter)
    removeClasses(el, config.enterFrom)
    removeClasses(el, config.enterTo)
    removeClasses(el, config.leave)
    removeClasses(el, config.leaveFrom)
    addClasses(el, config.leaveTo)
    if (config.leaveToStyle) Object.assign(el.style, config.leaveToStyle)
  }
}
