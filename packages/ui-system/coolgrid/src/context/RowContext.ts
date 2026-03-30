import { createContext } from '@pyreon/core'
import type { Context as ContextType } from '../types'

/**
 * Context for row-level grid configuration.
 * Provided by the Row component and consumed by Col children
 * to inherit columns, gap, gutter, and sizing for width calculations.
 */
export default createContext<ContextType>({})
