/** A signal-like accessor for a single URL search parameter. */
export interface UrlStateSignal<T> {
  /** Read the current value reactively. */
  (): T
  /** Write a new value and update the URL. */
  set(value: T): void
  /** Reset to the default value and update the URL. */
  reset(): void
}

/** Options for `useUrlState`. */
export interface UrlStateOptions<T = unknown> {
  /** Custom serializer — converts value to a URL-safe string. */
  serialize?: (value: T) => string
  /** Custom deserializer — converts URL string back to a value. */
  deserialize?: (raw: string) => T
  /**
   * Use `history.replaceState` (true) or `history.pushState` (false).
   * @default true
   */
  replace?: boolean
  /**
   * Debounce URL writes by this many milliseconds.
   * @default 0
   */
  debounce?: number
}

/** Serializer pair for a given type. */
export interface Serializer<T> {
  serialize: (value: T) => string
  deserialize: (raw: string) => T
}
