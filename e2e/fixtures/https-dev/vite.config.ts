// Imported by RELATIVE PATH, not as `@pyreon/zero/server`.
//
// `e2e/fixtures/*` is not a workspace glob (`packages/*/*`, `examples/*`,
// `docs`), so bun links no `@pyreon/*` here and a bare specifier does not
// resolve. Making it a workspace member to fix an import would be a lot of
// churn for a fixture — and the relative path is better anyway: it runs the
// SOURCE, so this suite cannot pass against a stale `lib/`.
import { https } from '../../../packages/zero/zero/src/https/index.ts'

/**
 * The smallest app that can prove `https()` works in a real browser.
 *
 * Deliberately NOT one of the shared examples: turning TLS on in an example
 * would change its dev behaviour for every other e2e suite that boots it.
 *
 * `selfSigned: true` pins the tier — otherwise a developer machine with mkcert
 * installed would exercise a different code path from CI, and the one that
 * needs proving is the zero-config fallback everybody gets by default.
 */
export default {
  plugins: [https({ selfSigned: true, quiet: true })],
}
