import { onUnmount } from "@pyreon/core";
import { throttle } from "@pyreon/ui-core";

type ThrottledFn<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
};

export type UseThrottledCallback = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
) => ThrottledFn<T>;

/**
 * Returns a throttled version of the callback.
 * Uses `throttle` from `@pyreon/ui-core`.
 * Always calls the latest callback (no stale closures).
 * Cleans up on unmount.
 */
export const useThrottledCallback: UseThrottledCallback = (callback, delay) => {
  const currentCallback = callback;

  const throttled = throttle((...args: any[]) => currentCallback(...args), delay);

  onUnmount(() => throttled.cancel());

  return throttled as ThrottledFn<typeof callback>;
};

export default useThrottledCallback;
