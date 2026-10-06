/**
 * Persisted signals — how a LIBRARY makes a signal outlive the process without the compiler core knowing the library.
 *
 * A signal-shaped declaration whose value survives a relaunch (`useStorage('theme', 'light')`) is still a signal:
 * reads, writes, `.update`, type inference, struct synthesis and the sibling-seed analysis are all the core's. What a
 * LIBRARY owns is (a) which calls produce one — a recognizer returns a {@link SignalDeclSpec} with a `persistKey`
 * (`CompilerPlugin.calls`) — and (b) the per-target persistence primitive the declaration line is built from, which
 * is runtime code the library ships (`CompilerPlugin.persistence`).
 *
 * A persisted declaration keeps the core's `signal` IR kind with a `storageKey`; the loaded plugin that declares
 * `persistence` renders it. Exactly one plugin may (the primitive is a property of the platform's persistence layer,
 * not of a call), so two are a load-time error naming both, and a persisted signal with none loaded is an error
 * naming the key.
 */

import type { EmitContext } from './emit-context'

/** What the core knows about a persisted signal declaration when it asks the backend to render it. */
export interface PersistedSignalSite {
  /** The binding as the author named it (render it through `ctx.ident`). */
  readonly name: string
  /** The storage key, baked at compile time (render it through `ctx.stringLiteral`). */
  readonly key: string
  /** The target spelling of the signal's type (SwiftUI's annotation, Compose's `typeStr`). */
  readonly type: string
  /** The initial value, already emitted as target text. */
  readonly initial: string
  /**
   * The PLATFORM's own persistence handles this type directly (SwiftUI's `@AppStorage` for scalars, enums and
   * optionals of them; Compose's `rememberSaveable` for Bundle-friendly types). A backend uses the platform
   * primitive then and its own runtime for everything else (structs, lists, objects).
   */
  readonly nativeType: boolean
  /** The type is a list seeded with an EMPTY array literal (Kotlin spells it `listOf()`, since the element type is not inferable). */
  readonly emptyList: boolean
}

/** What a Kotlin backend returns: a complete declaration, or the `remember`-like wrapper the core's own `mutableStateOf` line uses. */
export type KotlinPersistedSignal = { readonly line: string } | { readonly wrapper: string }

export interface SignalPersistence {
  /** The complete SwiftUI property declaration (`@AppStorage("k") private var x: T = v`). */
  swift(site: PersistedSignalSite, ctx: EmitContext): string
  /**
   * `{ line }` replaces the core's declaration entirely. `{ wrapper }` keeps it (null seeds, empty lists and all)
   * and swaps only the delegate: `var x by <wrapper> { mutableStateOf(v) }`.
   */
  kotlin(site: PersistedSignalSite, ctx: EmitContext): KotlinPersistedSignal
}

export interface RegisteredPersistence {
  readonly owner: string
  readonly persistence: SignalPersistence
}

type PersistencePlugin = { readonly name: string; readonly persistence?: SignalPersistence | undefined }

/** The one persistence backend among `plugins`, or `undefined`. Two are a load-time error naming both. */
export function createPersistenceRegistry(plugins: readonly PersistencePlugin[]): RegisteredPersistence | undefined {
  let found: RegisteredPersistence | undefined
  for (const plugin of plugins) {
    if (plugin.persistence === undefined) continue
    if (found !== undefined) {
      throw new Error(
        `[Pyreon] signal persistence is declared by both "${found.owner}" and "${plugin.name}". A compiler has exactly one ` +
          `persistence backend — remove one of the two plugins from this app.`,
      )
    }
    found = { owner: plugin.name, persistence: plugin.persistence }
  }
  return found
}
