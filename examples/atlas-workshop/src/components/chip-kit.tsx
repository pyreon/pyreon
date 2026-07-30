/**
 * A rocketstyle base built DIRECTLY on the public ui-system packages — no
 * `@pyreon/atlas` import on purpose. `atlas dev` filters workbench
 * infrastructure by that import, so the demo-catalog chains never reach the
 * live workbench; this kit exists to prove the shape a real design system
 * ships: a rocketstyle chain in ordinary project files.
 */
import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

export const rs = rocketstyle({ useBooleans: false })
export const chipBase = rs({ name: 'ChipBase', component: Element })
