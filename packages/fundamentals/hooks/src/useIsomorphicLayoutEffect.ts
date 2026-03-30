import { onMount } from "@pyreon/core";

/**
 * In Pyreon there is no SSR warning distinction between effect and
 * layout-effect as there is in React.
 *
 * On the client `onMount` fires synchronously after the component is
 * mounted (similar to useLayoutEffect). On the server `effect` is a
 * no-op. This export provides the appropriate primitive for each env.
 *
 * Consumers that need layout-timing should use `onMount` directly.
 * This hook is provided for API parity with the original library.
 */
export type UseIsomorphicLayoutEffect = typeof onMount;

const useIsomorphicLayoutEffect: UseIsomorphicLayoutEffect =
  typeof window !== "undefined" ? onMount : onMount;

export default useIsomorphicLayoutEffect;
