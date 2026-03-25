import { createContext } from "@pyreon/core"
import type { Context as ContextType } from "../types"

/**
 * Context for container-level grid configuration.
 * Provided by the Container component and consumed by Row children
 * to inherit columns, gap, gutter, and other grid settings.
 */
export default createContext<ContextType>({})
