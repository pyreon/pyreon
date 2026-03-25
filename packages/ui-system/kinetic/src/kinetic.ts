import createKineticComponent from "./kinetic/createKineticComponent"
import type { KineticComponent } from "./kinetic/types"

/**
 * Creates a reusable animated component via immutable chaining.
 *
 * @example
 * ```tsx
 * // Transition (default)
 * const FadeDiv = kinetic('div').preset(fade)
 *
 * // Collapse
 * const Accordion = kinetic('div').collapse()
 *
 * // Stagger
 * const StaggerList = kinetic('ul').preset(slideUp).stagger({ interval: 50 })
 *
 * // Group (key-based enter/exit)
 * const AnimatedList = kinetic('ul').preset(fade).group()
 * ```
 */
const kinetic = <Tag extends string>(tag: Tag): KineticComponent<Tag, "transition"> =>
  createKineticComponent<Tag, "transition">({ tag, mode: "transition" })

export default kinetic
