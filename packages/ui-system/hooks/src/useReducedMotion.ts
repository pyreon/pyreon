import { useMediaQuery } from "./useMediaQuery"

/**
 * Returns true when the user prefers reduced motion.
 */
export function useReducedMotion(): () => boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)")
}
