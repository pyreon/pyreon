/**
 * Guard for the classic TypeScript Compiler API used by the compiler's
 * detectors, audits, and migrators (`createSourceFile`, `ScriptTarget`,
 * `ScriptKind`, `forEachChild`).
 *
 * **Why this exists.** TypeScript 7 ("tsgo", the native preview published under
 * the `typescript` name — now `latest` on npm) REMOVED the classic Compiler
 * API. Under it `ts.ScriptTarget` is `undefined`, so a bare
 * `ts.createSourceFile(f, code, ts.ScriptTarget.ESNext, …)` throws the cryptic
 * `Cannot read properties of undefined (reading 'ESNext')` — the exact crash a
 * fresh `bunx @pyreon/mcp` hit once the uncapped `typescript: ">=5.0.0"` range
 * began resolving to 7.x. The package ranges are now capped `<7`, so a normal
 * install lands on a working 6.x; this guard is the safety net for a consumer
 * who force-pins TypeScript 7 anyway.
 *
 * Call `assertClassicTs()` at the entry of any code path that parses. It is a
 * plain function (not an eval-time / import-time check) so importing this
 * module never throws — the MCP server pulling `@pyreon/compiler` at startup,
 * and every non-parsing tool, stay alive; only a path that actually needs the
 * removed API fails, and fails with an actionable `[Pyreon]` message instead of
 * a mystifying `undefined.ESNext`. Cost is one property read on the supported
 * TS 5.x/6.x path, and the compiler's hot build transform never calls it (it
 * uses oxc-parser, not `ts`).
 */
import realTs from 'typescript'

/**
 * Throw an actionable error when the classic TypeScript Compiler API is absent
 * (TypeScript 7). No-op on TS 5.x/6.x. The `module` parameter defaults to the
 * installed TypeScript and is injectable purely so the throw path is unit
 * testable against a synthetic TS7-shaped module (no real TS7 install needed).
 */
export function assertClassicTs(
  module: { version?: string; ScriptTarget?: unknown } = realTs,
): void {
  if (module?.ScriptTarget === undefined) {
    const version = module?.version ?? 'an incompatible build'
    throw new Error(
      `[Pyreon] @pyreon/compiler needs TypeScript 5.x or 6.x (the classic Compiler API), ` +
        `but found TypeScript ${version}, which removed \`ScriptTarget\` / \`createSourceFile\`. ` +
        `TypeScript 7 ("tsgo") dropped the classic API, so pattern detection, migration, ` +
        `and audits cannot parse. Pin "typescript": ">=5.0.0 <7.0.0" in your project.`,
    )
  }
}
