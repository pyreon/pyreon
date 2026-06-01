import { provide } from '@pyreon/core'
import { batch, signal } from '@pyreon/reactivity'
import { omit } from '@pyreon/ui-core'
import type { PseudoProps } from '../types/pseudo'
import type { ComponentFn } from '../types/utils'
import { mergeDescriptors } from '../utils/attrs'
import { localContext } from './localContext'

type Props = PseudoProps & Record<string, any>

// Keys this HOC consumes — extracted into a frozen Set so `omit()` can
// reuse the pre-built shape on every render (saves the per-call Set
// allocation the array-form would pay).
const HOC_OWN_KEYS = new Set([
  'onMouseEnter',
  'onMouseLeave',
  'onMouseUp',
  'onMouseDown',
  'onFocus',
  'onBlur',
  '$rocketstate',
])

/**
 * Higher-order component that wraps a component with a LocalProvider,
 * detecting pseudo-states (hover, focus, pressed) via mouse/focus events
 * and broadcasting them through local context to child rocketstyle components.
 *
 * In Pyreon, context is provided via provide(), and state is managed
 * with signals instead of useState.
 *
 * **Descriptor preservation contract** — pre-fix this HOC used a
 * parameter-destructure (`({ onMouseEnter, …, ...props })`) and a final
 * value-spread (`{ ...props, ...events, $rocketstate }`). Both fire
 * every getter on the incoming props object — including the
 * `_rp(() => signal())`-converted getter descriptors that
 * `makeReactiveProps` installs for compiler-emitted reactive props.
 * Result: any signal-driven prop (`href`, `disabled`, `class`, ...) on a
 * rocketstyle-wrapped component with `provider: true` got snapshot-read
 * at this HOC entry, collapsing the live subscription to a one-shot
 * value. Downstream `applyProp` / `_bind` never re-fired on signal
 * change, so the DOM stayed static.
 *
 * Post-fix: receive `props` as a single argument; read named keys lazily
 * inside the event closures (so event-handler property descriptors fire
 * at mouse-event time, not at HOC setup); use `omit()` (descriptor-copy
 * from `@pyreon/ui-core`) to build the rest-props object and
 * `mergeDescriptors` to assemble the final props passed downstream.
 *
 * Same contract PR #584 established for the outer attrs / styled HOCs.
 * createLocalProvider was missed by that sweep — it sits between
 * EnhancedComponent and the styled leaf only when `options.provider: true`
 * (top-level rocketstyle wrappers), which is exactly the surface where
 * consumer-reported reactive-href breakage was seen on ui-components
 * Buttons.
 */
const createLocalProvider = (WrappedComponent: ComponentFn<any>) => {
  const HOCComponent: ComponentFn<Props> = (props) => {
    const hover = signal(false)
    const focus = signal(false)
    const pressed = signal(false)

    const events = {
      onMouseEnter: (e: MouseEvent) => {
        hover.set(true)
        // Read the user-supplied handler lazily — fires the descriptor
        // getter (if any) at mouse-event time, never at HOC setup. Event
        // handlers are typically stable function values so the getter
        // resolves to a function; calling it forwards the event.
        const user = props.onMouseEnter as ((e: MouseEvent) => void) | undefined
        if (user) user(e)
      },
      onMouseLeave: (e: MouseEvent) => {
        // batch() so consumers reading both hover + pressed (the common
        // styled-component case — pseudo-state CSS depends on both) get
        // notified once per mouseleave, not twice. Fires on every
        // mouseleave on every rocketstyle-styled component → hot.
        batch(() => {
          hover.set(false)
          pressed.set(false)
        })
        const user = props.onMouseLeave as ((e: MouseEvent) => void) | undefined
        if (user) user(e)
      },
      onMouseDown: (e: MouseEvent) => {
        pressed.set(true)
        const user = props.onMouseDown as ((e: MouseEvent) => void) | undefined
        if (user) user(e)
      },
      onMouseUp: (e: MouseEvent) => {
        pressed.set(false)
        const user = props.onMouseUp as ((e: MouseEvent) => void) | undefined
        if (user) user(e)
      },
      onFocus: (e: FocusEvent) => {
        focus.set(true)
        const user = props.onFocus as ((e: FocusEvent) => void) | undefined
        if (user) user(e)
      },
      onBlur: (e: FocusEvent) => {
        focus.set(false)
        const user = props.onBlur as ((e: FocusEvent) => void) | undefined
        if (user) user(e)
      },
    }

    // Use getters so pseudo-state signals are read lazily by consumers
    // inside their own reactive scopes — NOT eagerly during parent setup.
    // Without getters, hover()/focus()/pressed() reads here would register
    // as dependencies of any parent effect, causing cascading re-renders
    // on every mouse event.
    // Resolve $rocketstate if it's a function accessor (from EnhancedComponent).
    // This single property access fires the descriptor's getter (if any) —
    // intentional, since $rocketstate's getter returns a stable accessor
    // function and we need it now to construct updatedState.
    const incomingState = props.$rocketstate
    const resolvedState =
      typeof incomingState === 'function' ? incomingState() : incomingState
    const updatedState = {
      ...resolvedState,
      pseudo: {
        ...resolvedState?.pseudo,
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

    // Build the rest-props object via descriptor-copy (omit() from
    // @pyreon/ui-core preserves getter descriptors). Then merge with our
    // event handlers and the resolved $rocketstate using mergeDescriptors
    // — the events + $rocketstate layers are static data so their data
    // descriptors override any same-named getters on restProps.
    const restProps = omit(props, HOC_OWN_KEYS)
    const finalProps = mergeDescriptors(restProps, events, { $rocketstate: updatedState })

    return WrappedComponent(finalProps)
  }

  return HOCComponent
}

export default createLocalProvider
