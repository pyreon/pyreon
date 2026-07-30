/** Fixture kit — a rocketstyle base with NO @pyreon/atlas import. */
import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

export const rs = rocketstyle({ useBooleans: false })
export const box = rs({ name: 'FixtureBox', component: Element })
