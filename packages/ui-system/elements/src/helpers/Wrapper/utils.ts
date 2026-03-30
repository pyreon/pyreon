import { INLINE_ELEMENTS_FLEX_FIX } from './constants'

type IsWebFixNeeded = (tag?: string) => boolean
export const isWebFixNeeded: IsWebFixNeeded = (tag) => {
  if (tag && tag in INLINE_ELEMENTS_FLEX_FIX) return true
  return false
}
