import { effect } from "./effect";
import type { Signal } from "./signal";
import { signal } from "./signal";
import { runUntracked } from "./tracking";

export interface Resource<T> {
  /** The latest resolved value (undefined while loading or on error). */
  data: Signal<T | undefined>;
  /** True while a fetch is in flight. */
  loading: Signal<boolean>;
  /** The last error thrown by the fetcher, or undefined. */
  error: Signal<unknown>;
  /** Re-run the fetcher with the current source value. */
  refetch(): void;
}

/**
 * Async data primitive. Fetches data reactively whenever `source()` changes.
 *
 * @example
 * const userId = signal(1)
 * const user = createResource(userId, (id) => fetchUser(id))
 * // user.data() — the fetched user (undefined while loading)
 * // user.loading() — true while in flight
 * // user.error() — last error
 */
export function createResource<T, P>(
  source: () => P,
  fetcher: (param: P) => Promise<T>,
): Resource<T> {
  const data = signal<T | undefined>(undefined);
  const loading = signal(false);
  const error = signal<unknown>(undefined);
  let requestId = 0;

  const doFetch = (param: P) => {
    const id = ++requestId;
    loading.set(true);
    error.set(undefined);
    fetcher(param)
      .then((result) => {
        if (id !== requestId) return;
        data.set(result);
        loading.set(false);
      })
      .catch((err: unknown) => {
        if (id !== requestId) return;
        error.set(err);
        loading.set(false);
      });
  };

  effect(() => {
    const param = source();
    runUntracked(() => doFetch(param));
  });

  return {
    data,
    loading,
    error,
    refetch() {
      runUntracked(() => doFetch(source()));
    },
  };
}
