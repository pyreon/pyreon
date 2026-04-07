import { Element, Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const rs = rocketstyle({ useBooleans: true })

/** Base element component — all layout/interactive components extend this. */
export const el = rs({ name: 'Base', component: Element })

/** Base text component — all typography components extend this. */
export const txt = rs({ name: 'TextBase', component: Text })
