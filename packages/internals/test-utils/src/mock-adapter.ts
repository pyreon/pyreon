/**
 * Typed wrapper for vi.mock callback signatures.
 *
 * Pre-PR-6, ~180 test sites declared mock adapter callbacks as plain
 * `(opts: any) => {...}` because the external library type wasn't
 * available or wasn't worth importing. `mockAdapter<TOpts, TReturn>`
 * collapses that pattern: the callback's parameter and return are
 * typed at the call site without needing to import the underlying
 * adapter's typings.
 *
 * Runtime is a straight identity function — purely a typing helper.
 *
 * @example
 *   // Before:
 *   vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
 *     draggable: (opts: any) => {
 *       lastDraggableOpts = opts
 *       return () => {}
 *     },
 *   }))
 *
 *   // After (with the adapter's argument shape declared explicitly):
 *   interface DraggableArgs {
 *     element: HTMLElement
 *     getInitialData?: () => Record<string, unknown>
 *     onDragStart?: (e: PointerEvent) => void
 *   }
 *   type Cleanup = () => void
 *
 *   vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
 *     draggable: mockAdapter<DraggableArgs, Cleanup>((opts) => {
 *       lastDraggableOpts = opts
 *       return () => {}
 *     }),
 *   }))
 *
 * Note: when the upstream library exports its own arg shape (e.g.
 * pdnd's `DraggableArgs`), import it directly rather than redeclaring.
 */
export function mockAdapter<TOpts, TReturn>(
  impl: (opts: TOpts) => TReturn,
): (opts: TOpts) => TReturn {
  return impl
}

/**
 * Typed wrapper for `vi.mock` factories that return a flat object of
 * adapter functions. Wraps each value through `mockAdapter` so the
 * downstream call signature is typed but the runtime is unchanged.
 *
 * @example
 *   vi.mock('@some-lib/adapter', () =>
 *     mockAdapters({
 *       foo: (opts: FooArgs) => { ... },
 *       bar: (opts: BarArgs) => { ... },
 *     }),
 *   )
 */
export function mockAdapters<T extends Record<string, (...args: never[]) => unknown>>(
  factory: T,
): T {
  return factory
}
