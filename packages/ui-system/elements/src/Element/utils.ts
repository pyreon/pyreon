import { EMPTY_ELEMENTS, INLINE_ELEMENTS } from './constants'

type GetValue = (tag?: string) => boolean

/** Checks whether the given HTML tag is an inline-level element, used to determine sub-tag nesting. */
export const isInlineElement: GetValue = (tag) => {
  if (tag && tag in INLINE_ELEMENTS) return true
  return false
}

/** Checks whether the given HTML tag is a void element that cannot have children. */
export const getShouldBeEmpty: GetValue = (tag) => {
  if (tag && tag in EMPTY_ELEMENTS) return true
  return false
}
