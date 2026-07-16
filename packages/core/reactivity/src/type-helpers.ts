/**
 * Type-level inference helpers — "derive, don't annotate twice".
 *
 * These are ZERO-runtime exports (types only) that name the value-or-accessor
 * patterns used framework-wide. They let consumers derive a value type from an
 * existing signal/computed instead of repeating the annotation:
 *
 * @example
 * ```ts
 * const user = signal({ id: 1, name: 'Ada' })
 * type User = SignalValue<typeof user> // { id: number; name: string }
 *
 * function useTitle(title: MaybeAccessor<string>) {
 *   const resolved = () => (typeof title === 'function' ? title() : title)
 * }
 * ```
 */

/**
 * Unwrap the value type of a `Signal<T>`, `Computed<T>`, `ReadonlySignal<T>`,
 * or any zero-arg accessor `() => T`.
 *
 * Resolves to `never` for non-callable inputs (a plain value is NOT a signal —
 * use the value's own type directly).
 *
 * @example
 * ```ts
 * const count = signal(0)
 * type Count = SignalValue<typeof count> // number
 *
 * const items = signal<string[]>([])
 * type Items = SignalValue<typeof items> // string[]
 *
 * type Nope = SignalValue<number> // never — number is not a signal
 * ```
 */
export type SignalValue<S> = S extends () => infer T ? T : never

/**
 * Unwrap the value type of a `Computed<T>` (alias of {@link SignalValue} —
 * every Pyreon reactive read is a zero-arg callable, so one conditional
 * covers both; the alias exists for intent-revealing call sites).
 *
 * @example
 * ```ts
 * const total = computed(() => price() * qty())
 * type Total = ComputedValue<typeof total> // number
 * ```
 */
export type ComputedValue<C> = C extends () => infer T ? T : never

/**
 * A value that may be passed directly OR as a zero-arg accessor — the
 * standard "static or reactive" parameter shape used across Pyreon APIs
 * (`<Show when>`, hook options, wrapper props).
 *
 * NOT auto-called: accepting `MaybeAccessor<T>` means YOUR code must resolve
 * it (`typeof v === 'function' ? v() : v`) — read it inside a reactive scope
 * to preserve tracking. Use {@link AccessorReturn} to derive the resolved type.
 *
 * Note: when `T` is itself a function type, the two union arms are ambiguous
 * at runtime — prefer a dedicated options field for function-valued params.
 *
 * @example
 * ```ts
 * function useDebounced<T>(source: MaybeAccessor<T>, ms: number) {
 *   const read = () => (typeof source === 'function'
 *     ? (source as () => T)()
 *     : source)
 *   // ...
 * }
 * useDebounced(query, 300)     // accessor form — reactive
 * useDebounced('static', 300)  // value form — static
 * ```
 */
export type MaybeAccessor<T> = T | (() => T)

/**
 * Resolve a {@link MaybeAccessor} to its value type: unwraps the accessor
 * arm (`() => T` → `T`) and passes plain values through unchanged.
 *
 * @example
 * ```ts
 * type A = AccessorReturn<() => number>            // number
 * type B = AccessorReturn<string>                  // string
 * type C = AccessorReturn<MaybeAccessor<boolean>>  // boolean
 * ```
 */
export type AccessorReturn<A> = A extends () => infer T ? T : A
