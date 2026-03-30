import { computed } from "@pyreon/reactivity";
import type { ReadableSignal } from "./types";
import { isSignal } from "./types";

/**
 * Search items by substring matching across specified keys.
 * Case-insensitive. Signal-aware — reactive when either source or query is a signal.
 *
 * @example
 * ```ts
 * const results = rx.search(users, searchQuery, ["name", "email"])
 * ```
 */
export function search<T>(
  source: ReadableSignal<T[]> | T[],
  query: ReadableSignal<string> | string,
  keys: (keyof T)[],
): any {
  const isReactive = isSignal(source) || isSignal(query);

  const doSearch = (): T[] => {
    const arr = isSignal(source) ? (source as ReadableSignal<T[]>)() : source;
    const q = (isSignal(query) ? (query as ReadableSignal<string>)() : query).toLowerCase().trim();
    if (!q) return arr;
    return arr.filter((item) =>
      keys.some((key) => {
        const val = item[key];
        return typeof val === "string" && val.toLowerCase().includes(q);
      }),
    );
  };

  return isReactive ? computed(doSearch) : doSearch();
}
