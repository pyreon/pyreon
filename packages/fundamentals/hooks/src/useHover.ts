import { signal } from '@pyreon/reactivity'

export interface UseHoverResult {
  /** Reactive boolean — true when element is hovered */
  hovered: () => boolean
  /** Props to spread onto the element */
  props: {
    onMouseEnter: () => void
    onMouseLeave: () => void
  }
}

/**
 * Track hover state reactively.
 *
 * @example
 * const { hovered, props } = useHover()
 * h('div', { ...props, class: () => hovered() ? 'active' : '' })
 */
export function useHover(): UseHoverResult {
  const hovered = signal(false)

  return {
    hovered,
    props: {
      onMouseEnter: () => hovered.set(true),
      onMouseLeave: () => hovered.set(false),
    },
  }
}
