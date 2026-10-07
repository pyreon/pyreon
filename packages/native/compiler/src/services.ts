/**
 * Service descriptors — plain "service container" hooks as DATA.
 *
 * A *plain* service is a hook whose whole lowering is "hold one runtime
 * container for the component's lifetime": `const share = useShare()` becomes
 * an `@State` `PyreonShare()` on iOS and a remembered `PyreonShare(ctx)` on
 * Android, and every later call (`share.text("hi")`) flows through UNCHANGED —
 * no `.value` rewrite, no argument transformation, no reactive field, no
 * lifecycle. Before this module each such hook was a recognizer branch in
 * `parse.ts`, a `DeclIR` union member, and one emit branch per target, all
 * restating the same shape. Now a plain service is ONE entry in the library's
 * plugin (`@pyreon/hooks`' `native-plugin.ts`);
 * the parser lowers it to the generic `{ kind: 'service', hook }` declaration
 * and both emitters render it from the descriptor.
 *
 * Satellite behaviour has a small DATA vocabulary on the same descriptor, so a
 * service that is more than a bare container is still one entry:
 *
 *   - `accessorReads` — members the web reads as accessors (`clip.copied()`)
 *     but the native container stores as properties; the call's parens drop on
 *     both targets.
 *   - `callRead` — the property a BARE call of the container reads
 *     (`net()` → `net.isOnline`).
 *   - `kotlinState` — members that are Compose `MutableState` on Kotlin, so a
 *     read appends `.value` (Swift's @Observable needs no rewrite).
 *   - `lifecycle` — a reactive monitor whose `start()` MUST be called, or the
 *     hook renders its initial value forever (the never-wired class). Swift
 *     attaches `.onAppear`/`.onDisappear`; Kotlin's `rememberPyreonX()`
 *     factory self-installs, which is why the descriptor's Kotlin line names it.
 *   - `destructure` — `const { copy } = useX()` aliases onto the container.
 *   - `optionalFields` — members the runtimes declare optional, for typing.
 *
 * Deliberately NOT here (they stay hand-written): `useDatabase` (its `insert`
 * and Swift argument-label rewrites are call LOGIC, not data), `useWebSocket`
 * (constructor argument taken from the call + auto-connect synthesis), and
 * services with a struct-typed generic (`useAuth<T>`, `useFetch<T>`,
 * `useStream<T>`).
 */

import type { TypeIR } from './types'

/**
 * A service container's `error` is an error OBJECT on both runtimes (`Error?`
 * on Swift, `Throwable?` on Kotlin) and on the web — never a string, so the
 * nil test is the faithful lowering of a JS truthiness check on it.
 */
export const ERROR_OBJECT: TypeIR = { kind: 'typeRef', name: 'Error', args: [] }

export interface ServiceDescriptor {
  /** The hook the author calls, e.g. `useShare`. */
  readonly hook: string
  /**
   * The decl kind this hook lowered to BEFORE it was a descriptor. A module's
   * synthesized-struct suffix (`__Obj0_ab12cd`) hashes the parsed IR
   * (`moduleTag`), so moving a hook onto the generic `service` declaration
   * would rename every anonymous struct in every file that uses it — output
   * that is otherwise byte-identical. `moduleTag` hashes a service decl as
   * `{ kind: legacyKind, name }` so the names hold. Droppable the next time
   * the golden is deliberately re-baselined.
   */
  readonly legacyKind: string
  /**
   * Swift initialiser expression, placed after `@State private var <id> = `.
   * Emitted verbatim.
   */
  readonly swift: string
  /**
   * Kotlin declaration lines, emitted in order and joined with `\n  `. `{id}`
   * is replaced by the declaration's Kotlin identifier (every occurrence), so a
   * descriptor may hoist a composition-local into a sibling val
   * (`val {id}Ctx = LocalContext.current`) or wire a launcher after the `val`.
   * A line carries its OWN extra indentation, so a continuation line renders
   * exactly as the hand-written emit did.
   */
  readonly kotlin: readonly string[]
  /**
   * Members the web reads as ACCESSORS (`copied()`) that the native container
   * stores as properties: a zero-argument member call of one lowers to the
   * property read on BOTH targets (Kotlin appends `.value` for members also
   * listed in `kotlinState`).
   */
  readonly accessorReads?: readonly string[]
  /**
   * The property a BARE zero-argument call of the container reads — web
   * accessors like `useOnline()` are called (`net()`); natively it is a
   * property (`net.isOnline`, + `.value` on Kotlin when listed in `kotlinState`).
   */
  readonly callRead?: string
  /**
   * Members that are Compose `MutableState` on Kotlin: a read — member form or
   * zero-argument call form — appends `.value`. Members NOT listed read bare
   * (plain getters, methods). Swift's @Observable properties need no rewrite.
   */
  readonly kotlinState?: readonly string[]
  /**
   * A reactive monitor that must be started or the hook ships frozen at its
   * initial value. `'start-stop'` → Swift `.onAppear { x.start() }` +
   * `.onDisappear { x.stop() }`; `'start'` → `.onAppear` only. Kotlin has no
   * emit-side wiring: its descriptor line is the self-installing
   * `rememberPyreon<Container>()` factory.
   */
  readonly lifecycle?: 'start' | 'start-stop'
  /** `const { x } = useHook()` destructure aliases onto the container. */
  readonly destructure?: true
  /**
   * Members the runtimes declare optional, mapped to their value type — typed
   * as nullable so BOTH emitters wrap the interpolation and the condition
   * lowering fires (web renders nothing; native would print `Optional(…)`).
   */
  readonly optionalFields?: Readonly<Record<string, TypeIR>>
}

/** Render a descriptor's Kotlin lines for a Kotlin identifier. */
export function renderKotlinService(s: ServiceDescriptor, id: string): string {
  return s.kotlin.map((line) => line.replaceAll('{id}', () => id)).join('\n  ')
}
