import { onMount } from '@pyreon/core'

/**
 * In Pyreon there is no SSR warning distinction between effect and
 * layout-effect as there is in React.
 *
 * On the client `onMount` fires synchronously after the component is
 * mounted (similar to useLayoutEffect). On the server it is a no-op —
 * `onMount` never runs during SSR — so the single `onMount` primitive is
 * already isomorphic and no environment branch is needed.
 *
 * Consumers that need layout-timing should use `onMount` directly. This
 * hook is provided for API parity with the original library.
 */
export type UseIsomorphicLayoutEffect = typeof onMount

const useIsomorphicLayoutEffect: UseIsomorphicLayoutEffect = onMount

export default useIsomorphicLayoutEffect
