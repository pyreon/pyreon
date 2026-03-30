import { createContext, useContext } from '@pyreon/core'
import type { PseudoState } from '../types/pseudo'

type LocalContext = Partial<
  {
    pseudo: PseudoState
  } & Record<string, string>
>

/**
 * Local context for propagating pseudo-state (hover, focus, pressed)
 * and additional styling attributes from a parent provider component
 * to its rocketstyle children.
 */
const localContext = createContext<LocalContext>({})

const EMPTY_CTX = { pseudo: {} } as LocalContext

/**
 * Retrieves the local pseudo-state context. When a consumer callback
 * is provided, it transforms the raw context; otherwise returns defaults.
 *
 * In Pyreon, components are plain functions that run once — no useMemo needed.
 */
type UseLocalContext = (consumer: any) => LocalContext
export const useLocalContext: UseLocalContext = (consumer) => {
  const ctx = useContext(localContext)

  if (!consumer) return EMPTY_CTX

  const result = consumer((callback: any) => callback(ctx))
  return { pseudo: {}, ...result }
}

export { localContext }

export default localContext
