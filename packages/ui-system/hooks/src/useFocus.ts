import { signal } from "@pyreon/reactivity"

export interface UseFocusResult {
  focused: () => boolean
  props: {
    onFocus: () => void
    onBlur: () => void
  }
}

/**
 * Track focus state reactively.
 */
export function useFocus(): UseFocusResult {
  const focused = signal(false)

  return {
    focused,
    props: {
      onFocus: () => focused.set(true),
      onBlur: () => focused.set(false),
    },
  }
}
