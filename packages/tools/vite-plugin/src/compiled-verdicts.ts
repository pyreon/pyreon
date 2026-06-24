// Compiled validator verdicts — the build-only codegen behind
// `pyreon({ compileValidators: true })`. Isolated in its OWN module so it can
// be excluded from CodeQL (`.github/codeql/codeql-config.yml` paths-ignore):
// this is a CODE GENERATOR whose input is the consuming app's OWN
// `@pyreon/validate` schema source (never untrusted runtime input), the same
// accepted pattern as the validate runtime JIT. CodeQL's `js/bad-code-
// sanitization` / `js/unsafe-code-construction` queries are false positives for
// a build-time emitter — but they can't be path-scoped via query-filters, so
// the codegen lives here, behind a one-file exclusion, while the rest of the
// plugin stays fully scanned. Correctness is locked instead by the compiler's
// emit-equivalence gate + the plugin's transform-driven tests.
import { analyzeValidate, emitValidator } from '@pyreon/compiler'

/**
 * A strict JS identifier. `info.name` is the ONE user-derived value that flows
 * UNQUOTED into the emitted `name._attachCompiledVerdict(…)`, so it's the only
 * code-injection surface. `analyzeValidate` only ever returns a TS identifier
 * here (`ts.isIdentifier(n.name)`), which the grammar already restricts to this
 * charset — but validating it EXPLICITLY before interpolation makes the safety
 * provable rather than implied.
 */
const JS_IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/

/**
 * Build the module-end tail that attaches inlined compiled verdicts to every
 * MODULE-LEVEL, fully-emittable `const X = s.<schema>` in `code`. Each becomes
 *
 *   ;X._attachCompiledVerdict((v) => { try { return (<emit>)(v).length === 0 }
 *                                      catch { return false } });
 *
 * — a monomorphic boolean fast path the runtime `.is()` uses instead of
 * `parse().ok`. The emitted validator is byte-equivalent to the runtime (locked
 * by the compiler's emit-equivalence gate), so this only changes SPEED, never
 * the verdict. The `try/catch → false` wrap matches the runtime contract that
 * `.is()` never throws on malformed input.
 *
 * Returns `''` when nothing is emittable. Skips: anonymous schema expressions
 * (`name === null`), schemas containing an `unsupported` IR node (`!emittable`),
 * non-identifier names, and function/block-scoped declarations (`!topLevel` — a
 * module-end attach to those would be a ReferenceError).
 */
export function buildCompiledVerdicts(code: string, id: string): string {
  let infos: ReturnType<typeof analyzeValidate>
  try {
    infos = analyzeValidate(code, id)
  } catch {
    return ''
  }
  const tails: string[] = []
  for (const info of infos) {
    if (!info.name || !info.emittable || !info.topLevel) continue
    // Guard the one unquoted interpolation site (belt-and-suspenders vs
    // `analyzeValidate`'s identifier-only guarantee).
    if (!JS_IDENTIFIER_RE.test(info.name)) continue
    let fn: string
    try {
      // `emitValidator` is the trusted, equivalence-gated emitter: every user
      // string in the IR (check messages, regex sources, literal values) is
      // emitted via `JSON.stringify` / `new RegExp(JSON.stringify(...))` /
      // numeric literals, so `fn` is a self-contained, injection-safe function
      // source by construction — no user value reaches an unquoted position.
      fn = emitValidator(info.node)
    } catch {
      continue // defensive: a node the analyzer marked emittable but emit rejects
    }
    tails.push(
      `;${info.name}._attachCompiledVerdict((__v) => { try { return (${fn})(__v).length === 0 } catch { return false } });`,
    )
  }
  if (tails.length === 0) return ''
  return `\n/* @pyreon/vite-plugin: compiled validator verdicts (build-only) */\n${tails.join('\n')}\n`
}
