// What a file's `@pyreon/validate` imports and declarations tell the plugin — recorded by the pre-pass
// (`scanModule`) and read by the top-level and method-call recognizers.

/** Per-file memory (`fileState`): the compiler never reads it. */
export interface ValidateFacts {
  /**
   * Local name(s) bound to the `s` schema namespace (`import { s }` → `s`; `import { s as v }` → `v`).
   *
   * Gated on the IMPORT rather than the bare name, unlike the zod/valibot/arktype recognizers: those key on a
   * distinctive wrapper call (`zodSchema(...)`), but `s.object({ … })` is a shape a user's own single-letter
   * binding could plausibly produce, and mis-lowering someone else's `s` would be worse than not lowering ours.
   */
  readonly names: Set<string>
  /**
   * File-scope schema BINDINGS (`const Pet = s.object({ … })` → `object`, `s.discriminatedUnion(…)` → `union`),
   * collected syntactically BEFORE any component is parsed — a component can sit above the schema it validates
   * with, and components parse in source order. `Pet.safeParse(x)` resolves through this map.
   */
  readonly bindings: Map<string, 'object' | 'union'>
  /** Bindings whose `.safeParse(x)` lowered to `safeParseResult` — `finishModule` marks each matching schema so the method exists. */
  readonly safeParseResultBindings: Set<string>
  /** Dedup for inline schemas keyed by the source text of the `s.object({ … })` node: two byte-identical ones share ONE struct. */
  readonly inlineByShape: Map<string, string>
  /** Monotonic counter for synthesized inline-schema binding names (`Inline0`, `Inline1`, …). */
  inlineCounter: number
}

const FACTS_KEY = '@pyreon/validate:facts'

export function validateFacts(source: { fileState<T>(key: string, init: () => T): T }): ValidateFacts {
  return source.fileState<ValidateFacts>(FACTS_KEY, () => ({
    names: new Set(),
    bindings: new Map(),
    safeParseResultBindings: new Set(),
    inlineByShape: new Map(),
    inlineCounter: 0,
  }))
}
