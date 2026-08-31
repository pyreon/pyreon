import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPortablePath, portablePathsFrom } from '../../utils/portable-paths'

/**
 * A TypeScript construct the multiplatform compiler cannot lower.
 *
 * PMTC compiles a declarative TS subset to SwiftUI and Compose. Everything
 * outside that subset is warned about — but only for files a native app's
 * entry graph actually REACHES. A shared component written today and wired
 * into a native example next month is compiled by nothing in between, which is
 * the shape this repo's catalog names outright: "a primitive/feature no
 * example uses is one no gate ever compiles."
 *
 * This rule closes that window. It reports the same constructs PMTC reports,
 * at authoring time, in the editor, on every file regardless of who imports
 * it. It is deliberately a WARN and opt-in: a file that will only ever be web
 * is entitled to all of TypeScript, and the project decides which files are
 * meant to travel.
 *
 * Only the cheap, unambiguous constructs are listed. Anything needing type
 * inference — Int-vs-Double, comparator arity, accessor spelling — stays with
 * PMTC, which is the only thing that can answer it. The linter is a fast
 * pre-filter, not a second compiler.
 *
 * **Fires on nothing until `portablePaths` names the files that must travel.**
 * That is not timidity, it is measurement: run unscoped over this repo it
 * produced 4,388 findings, essentially all of them in web-only framework
 * internals that are entitled to the whole language. "Which files are meant to
 * reach iOS and Android" is a project's decision and cannot be inferred from a
 * file's contents — so the rule asks, and stays silent until told.
 */

export const noOutOfSubsetConstruct: Rule = {
  meta: {
    id: 'pyreon/no-out-of-subset-construct',
    category: 'portable',
    description:
      'A construct outside the PMTC subset (`enum`, `class`, `try`/`throw`, regex literal, `JSON.*`, computed key) in a file meant to reach iOS and Android — reported at authoring time rather than at the next native build.',
    severity: 'warn',
    optIn: true,
    fixable: false,
    schema: { portablePaths: 'string[]' },
  },
  create(context) {
    // Substring match, same convention as `exemptPaths`. Shared with the four
    // sibling portable rules so all five read the option identically — a
    // second copy is how two rules end up disagreeing about the same key.
    const paths = portablePathsFrom(context)
    if (paths.length === 0) return {}
    if (!isPortablePath(context.getFilePath(), paths)) return {}

    const say = (what: string, why: string, node: unknown) =>
      context.report({
        message: `\`${what}\` is outside the PMTC subset, so this file cannot lower to SwiftUI / Compose — ${why}. PMTC reports this too, but only once a native app's entry graph reaches the file; this catches it while you are writing it.`,
        span: getSpan(node),
      })

    const callbacks: VisitorCallbacks = {
      TSEnumDeclaration(node: any) {
        say('enum', 'use a union of string literals', node)
      },
      ClassDeclaration(node: any) {
        say('class', 'use a plain object type plus functions', node)
      },
      ClassExpression(node: any) {
        say('class', 'use a plain object type plus functions', node)
      },
      TryStatement(node: any) {
        say('try/catch', 'model failure as a returned value instead', node)
      },
      ThrowStatement(node: any) {
        say('throw', 'model failure as a returned value instead', node)
      },
      // A regex literal is a `Literal` carrying a `regex` field — there is no
      // `RegExpLiteral` node type in oxc, and naming one THROWS at visitor
      // construction, which takes down every rule in the run rather than just
      // this one. The fires-invariant caught that immediately.
      Literal(node: any) {
        if (node?.regex) {
          say('a regex literal', 'use string methods (`includes`, `startsWith`, `split`)', node)
        }
      },
      MemberExpression(node: any) {
        if (
          node?.object?.type === 'Identifier' &&
          String(node.object.name) === 'JSON' &&
          node.property?.type === 'Identifier'
        ) {
          say(`JSON.${String(node.property.name)}`, 'pass structured data as typed objects', node)
        }
      },
      Property(node: any) {
        if (node?.computed === true) {
          say('a computed object key', 'both targets need statically-known field names', node)
        }
      },
    }
    return callbacks
  },
}
