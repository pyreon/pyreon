import type { ElementType } from './utils'

export type GenericHoc = (component: ElementType) => ElementType

/**
 * Parameters for `.compose()` — a record of named HOCs.
 * Setting a key to `null`, `undefined`, or `false` removes a
 * previously defined HOC from the chain.
 */
export type ComposeParam = Record<string, GenericHoc | null | undefined | false>
