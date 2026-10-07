// How `@pyreon/storage` crosses to native: a signal that outlives the process, and the two that do not.
//
//   `useStorage<T>('key', initial)`      → a PERSISTED signal: SwiftUI's `@AppStorage` for scalars / enums / optionals of
//                                          them, the library's `@PyreonAppStorage` Codable bridge for everything else;
//                                          Compose's `rememberSaveable`, or `rememberPyreonStorage` for what Compose cannot save
//   `useSessionStorage` / `useMemoryStorage` → PLAIN state: the process IS the session, so in-memory state is the exact
//                                          analogue rather than an approximation of one
//
// All three are a core `signal` declaration (reads, writes, `.update`, type inference and struct synthesis are the
// core's own): the recognizers say only which argument holds the initial value and whether the signal persists, and the
// plugin's `persistence` renders the persisted ones. `useCookie` and `useIndexedDB` have no native analogue at all,
// and the unlowered-module advice says so.
//
// The storage key MUST be statically known (an inline string, or a module-scope `const` holding one): it is BAKED into
// the emit, and a computed or imported key cannot be resolved at build time.

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  kotlinStr,
  swiftStr,
  type CallRecognizer,
  type CompilerPlugin,
  type SignalPersistence,
} from '@pyreon/native-compiler/plugin-api'
import { storageStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const STORAGE_PLUGIN_NAME = '@pyreon/storage'

/** `useStorage<T>('key', default)` — a persisted signal. The key is arg 0, the initial value arg 1. */
const recognizeStorage: CallRecognizer = (_call, ctx) => {
  const keyArg = ctx.args[0] as AnyNode | undefined
  const key = ctx.staticString(keyArg)
  if (key === null) {
    ctx.report(
      `Declaration ${ctx.declName}: useStorage needs a statically-known key — an inline string, or a module-scope \`const\` holding one. The key is BAKED into the native emit, so a computed or imported one cannot be resolved at build time. Got ${keyArg?.type ?? 'nothing'}.`,
    )
    return null
  }
  return { signal: { initial: ctx.args[1], persistKey: key } }
}

/**
 * `useSessionStorage(key, initial)` / `useMemoryStorage(key, initial)` — process-scoped storage. On the web sessionStorage
 * survives a reload and dies with the tab; native has neither a tab nor a reload, so a plain state field is the honest
 * mapping, and persisting it would wrongly outlive the process.
 */
const recognizeProcessScoped: CallRecognizer = (_call, ctx) => ({ signal: { initial: ctx.args[1] } })

const persistence: SignalPersistence = {
  swift(site, ctx) {
    const name = ctx.ident(site.name)
    const key = swiftStr(site.key)
    // SwiftUI's own `@AppStorage` writes through to UserDefaults and triggers re-renders like `@State`, for the types it
    // can hold. Anything else routes through the Codable bridge in the library's runtime: the real `@AppStorage` slot
    // stores a JSON `Data` blob, a computed property wraps it. Consumer apps `import PyreonRuntime`, the same convention
    // as `@AppStorage` requiring `import SwiftUI` — the compiler does not auto-emit imports.
    return site.nativeType
      ? `@AppStorage(${key}) private var ${name}: ${site.type} = ${site.initial}`
      : `@PyreonAppStorage(${key}) private var ${name}: ${site.type} = ${site.initial}`
  },
  kotlin(site, ctx) {
    // Compose's `rememberSaveable` saves and restores state across configuration changes and process-death restoration for
    // the Bundle-friendly types (strings, numbers, booleans, enums). Anything else uses `rememberPyreonStorage` from the
    // library's runtime: one line at the call site, a pluggable backend (InMemoryBackend by default, DataStoreBackend for
    // real cross-launch persistence), and the same MutableState projection and `by` delegate.
    if (site.nativeType) return { wrapper: 'rememberSaveable' }
    const name = ctx.ident(site.name)
    return {
      line: `var ${name} by rememberPyreonStorage<${site.type}>(${kotlinStr(site.key)}, ${site.emptyList ? 'listOf()' : site.initial})`,
    }
  },
}

/**
 * The `@pyreon/storage` native plugin. Shipped by `@pyreon/storage` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const storagePlugin: CompilerPlugin = Object.freeze({
  name: STORAGE_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: Object.freeze([STORAGE_PLUGIN_NAME]),
  calls: Object.freeze({
    useStorage: recognizeStorage,
    useSessionStorage: recognizeProcessScoped,
    useMemoryStorage: recognizeProcessScoped,
  }),
  // Every recognizer returns a core SIGNAL, never a declaration of the plugin's own, so there are no emitters (the shape
  // check asks for `decls` whenever `calls` is declared: an empty one says so on purpose).
  decls: Object.freeze({}),
  // `const { value } = useStorage(…)` aliases onto the container like any other lowered hook.
  destructureCalls: Object.freeze(['useStorage']),
  // A persisted signal lowers to a `remember {}` / an `@State`, which has no meaning at file scope.
  componentOnlyCalls: Object.freeze(['useStorage', 'useSessionStorage', 'useMemoryStorage']),
  persistence,
  unlowered: Object.freeze({
    // Three of the five backends lower. The two that do not are the two with no native analogue AT ALL, and saying which
    // is which is the point — the generic line left an author guessing whether their backend was merely unimplemented or
    // genuinely impossible.
    //
    //   useStorage        → @AppStorage / rememberPyreonStorage (persistent)
    //   useSessionStorage → plain state (the process IS the session)
    //   useMemoryStorage  → plain state (definitionally process-scoped)
    //   useCookie         → no analogue: cookies are an HTTP/browser concept; a native app has no cookie jar its own UI reads from
    //   useIndexedDB      → no analogue: use `useDatabase()`, which lowers to SQLite on both targets
    [STORAGE_PLUGIN_NAME]: Object.freeze({
      advice:
        '`useStorage(key, initial)` DOES lower on both targets (as do `useSessionStorage` and `useMemoryStorage`) — use a hook rather than the factory. `useCookie` and `useIndexedDB` have no native analogue at all: a native app has no cookie jar, and for structured local data `useDatabase()` lowers to SQLite on both targets',
    }),
  }),
  stubs: storageStubs,
})
