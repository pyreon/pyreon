import { provide } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { PseudoProps } from '../types/pseudo'
import type { ComponentFn } from '../types/utils'
import { localContext } from './localContext'

type Props = PseudoProps & Record<string, any>

/**
 * Higher-order component that wraps a component with a LocalProvider,
 * detecting pseudo-states (hover, focus, pressed) via mouse/focus events
 * and broadcasting them through local context to child rocketstyle components.
 *
 * In Pyreon, context is provided via provide(), and state is managed
 * with signals instead of useState.
 */
const createLocalProvider = (WrappedComponent: ComponentFn<any>) => {
  const HOCComponent: ComponentFn<Props> = ({
    onMouseEnter,
    onMouseLeave,
    onMouseUp,
    onMouseDown,
    onFocus,
    onBlur,
    $rocketstate,
    ...props
  }) => {
    const hover = signal(false)
    const focus = signal(false)
    const pressed = signal(false)

    const events = {
      onMouseEnter: (e: MouseEvent) => {
        hover.set(true)
        if (onMouseEnter) onMouseEnter(e)
      },
      onMouseLeave: (e: MouseEvent) => {
        hover.set(false)
        pressed.set(false)
        if (onMouseLeave) onMouseLeave(e)
      },
      onMouseDown: (e: MouseEvent) => {
        pressed.set(true)
        if (onMouseDown) onMouseDown(e)
      },
      onMouseUp: (e: MouseEvent) => {
        pressed.set(false)
        if (onMouseUp) onMouseUp(e)
      },
      onFocus: (e: FocusEvent) => {
        focus.set(true)
        if (onFocus) onFocus(e)
      },
      onBlur: (e: FocusEvent) => {
        focus.set(false)
        if (onBlur) onBlur(e)
      },
    }

    // Use getters so pseudo-state signals are read lazily by consumers
    // inside their own reactive scopes — NOT eagerly during parent setup.
    // Without getters, hover()/focus()/pressed() reads here would register
    // as dependencies of any parent effect, causing cascading re-renders
    // on every mouse event.
    const updatedState = {
      ...$rocketstate,
      pseudo: {
        ...$rocketstate?.pseudo,
        get hover() {
          return hover()
        },
        get focus() {
          return focus()
        },
        get pressed() {
          return pressed()
        },
      },
    }

    // Provide local context for child rocketstyle components
    provide(localContext, updatedState)

    return WrappedComponent({
      ...props,
      ...events,
      $rocketstate: updatedState,
    })
  }

  return HOCComponent
}

export default createLocalProvider
