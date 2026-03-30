/** A signal-like accessor for a single URL search parameter. */
export interface UrlStateSignal<T> {
  /** Read the current value reactively. */
  (): T;
  /** Write a new value and update the URL. */
  set(value: T): void;
  /** Reset to the default value and update the URL. */
  reset(): void;
  /** Remove the parameter from the URL entirely and reset signal to default. */
  remove(): void;
}

/** Encoding strategy for array values in the URL. */
export type ArrayFormat =
  /** Comma-separated: `?tags=a,b` */
  | "comma"
  /** Repeated keys: `?tags=a&tags=b` */
  | "repeat";

/** Options for `useUrlState`. */
export interface UrlStateOptions<T = unknown> {
  /** Custom serializer — converts value to a URL-safe string. */
  serialize?: (value: T) => string;
  /** Custom deserializer — converts URL string back to a value. */
  deserialize?: (raw: string) => T;
  /**
   * Use `history.replaceState` (true) or `history.pushState` (false).
   * @default true
   */
  replace?: boolean;
  /**
   * Debounce URL writes by this many milliseconds.
   * @default 0
   */
  debounce?: number;
  /**
   * Encoding strategy for array values.
   * - `"comma"` — comma-separated: `?tags=a,b` (default)
   * - `"repeat"` — repeated keys: `?tags=a&tags=b`
   * @default "comma"
   */
  arrayFormat?: ArrayFormat;
  /**
   * Called when the URL param changes externally (popstate or another
   * `useUrlState` call updating the same param).
   */
  onChange?: (value: T) => void;
}

/** Serializer pair for a given type. */
export interface Serializer<T> {
  serialize: (value: T) => string;
  deserialize: (raw: string) => T;
}
