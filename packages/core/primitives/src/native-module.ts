/**
 * User-defined native modules — the FFI escape hatch (Layer 4).
 *
 * The 15 canonical primitives and the built-in service hooks cover the
 * common surface, but every real app eventually needs something the
 * framework does not ship: a Bluetooth stack, an AR scene, a payments
 * SDK, a vendor analytics library. Before this escape hatch the only
 * path was a framework PR — the compiler recognised platform services
 * by hard-coded name (`if (calleeName === 'useHaptics')`), so an app
 * could not add one itself.
 *
 * `useNativeModule('Name')` closes that: PMTC lowers it to a plain
 * instance of a class YOU provide (`Name()` on iOS, `Name(context)` on
 * Android), and member calls flow through unchanged — exactly the
 * lowering every built-in imperative service already uses. On web the
 * same call resolves the implementation registered by
 * `defineNativeModule`, so one source runs on all three targets.
 *
 * @example
 * ```ts
 * // bluetooth.ts — types + the web implementation
 * export type Bluetooth = {
 *   isSupported(): boolean
 *   connect(id: string): Promise<boolean>
 * }
 *
 * defineNativeModule<Bluetooth>('Bluetooth', {
 *   isSupported: () => 'bluetooth' in navigator,
 *   connect: async (id) => { ... },
 * })
 * ```
 *
 * ```tsx
 * // a component — identical source on web, iOS and Android
 * function Pairing() {
 *   const bt = useNativeModule<Bluetooth>('Bluetooth')
 *   return <Button onPress={() => { void bt.connect('cuff') }}>Connect</Button>
 * }
 * ```
 *
 * The native side is ordinary platform code you drop into your app:
 * `Bluetooth.swift` declaring `final class Bluetooth` with a no-argument
 * initialiser, and `Bluetooth.kt` declaring `class Bluetooth(context: Context)`.
 * Method names and argument types must match what the shared `.tsx` calls
 * — the compiler passes them through verbatim and the platform compiler
 * type-checks the result.
 */

/** The shape of a native module: a bag of methods and/or properties. */
export type NativeModuleShape = Record<string, unknown>

/**
 * Registry of web implementations, keyed by the SAME string the shared
 * source passes to `useNativeModule`. Module-level and unbounded by
 * design: registrations are per-module-name and created once at app
 * setup (a fixed, small set), never per render — re-registering the same
 * name replaces the entry rather than growing the map.
 */
const _webImplementations = new Map<string, NativeModuleShape>()

/**
 * Register the WEB implementation of a native module.
 *
 * Native targets never call this — PMTC replaces `useNativeModule` with
 * your Swift/Kotlin class at compile time, so this registration (and the
 * whole web implementation) is simply unused there. Returns the
 * implementation so it can be exported and unit-tested directly.
 *
 * @param name Module name — must match the string passed to `useNativeModule`
 *             AND the Swift/Kotlin class name.
 * @param webImpl The implementation used when running on web.
 */
export function defineNativeModule<T extends NativeModuleShape>(
  name: string,
  webImpl: T,
): T {
  if (process.env.NODE_ENV !== 'production') {
    if (!name) {
      console.warn(
        '[Pyreon] defineNativeModule() needs a non-empty module name — it is the key `useNativeModule(name)` looks up and the Swift/Kotlin class name PMTC emits.',
      )
    } else if (_webImplementations.has(name)) {
      console.warn(
        `[Pyreon] defineNativeModule("${name}") was called twice; the later implementation replaces the earlier one. Register each native module once at app setup.`,
      )
    }
  }
  _webImplementations.set(name, webImpl)
  return webImpl
}

/**
 * Resolve a native module.
 *
 * On **iOS / Android** PMTC intercepts this call at compile time and
 * emits an instance of your platform class (`Name()` / `Name(context)`) —
 * the import is a type anchor, this function body never runs.
 *
 * On **web** it returns the implementation registered for `name` by
 * `defineNativeModule`, throwing an actionable error when none exists
 * (a silent `undefined` would surface far from the cause).
 *
 * Call it at component-body top level, like every other hook — PMTC
 * recognises the declaration form `const x = useNativeModule('Name')`.
 */
export function useNativeModule<T extends NativeModuleShape>(name: string): T {
  const impl = _webImplementations.get(name)
  if (!impl) {
    throw new Error(
      `[Pyreon] No web implementation registered for native module "${name}". ` +
        `Call defineNativeModule("${name}", { … }) at app setup so the shared source runs on web too. ` +
        `(On iOS/Android this call is replaced at compile time by your ${name} Swift/Kotlin class, so only the web side needs registering.)`,
    )
  }
  return impl as T
}

/**
 * Whether a web implementation is registered for `name`. Useful for
 * feature-gating a screen on web without triggering `useNativeModule`'s
 * throw. Always `false` on native (where the call is compiled away).
 */
export function hasNativeModule(name: string): boolean {
  return _webImplementations.has(name)
}

/**
 * Drop every registered web implementation. Test-only helper — keeps
 * module registrations from leaking across test files.
 */
export function _resetNativeModules(): void {
  _webImplementations.clear()
}
