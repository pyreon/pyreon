/**
 * Type shim for the Octane impl.
 *
 * `.tsrx` is Octane's own source extension — TSRX is a TypeScript SUPERSET
 * (`@{ … }` component bodies, `@for (… ; key …)` blocks), so plain `tsc`
 * cannot parse it and `tsc --noEmit` fails the whole example with TS2307 on
 * the `./impl/octane.tsrx` import. Octane ships editor typing through
 * `octane/compiler/volar`, but that is a language-service plugin and does not
 * help a headless `tsc` run, which is what the `typecheck` gate runs.
 *
 * So this declares the module's public surface for `tsc` only. The tradeoff is
 * explicit and worth stating: **the body of `octane.tsrx` is NOT typechecked
 * by our gate** — only this boundary is. That is acceptable here because the
 * file is benchmark-only (it ships to no user), and because the thing that
 * actually validates it is stronger than types: `bench-fair.ts` verifies the
 * rendered DOM after every single iteration (`expectRows` /
 * `expectRowsWithSelected`), so a broken Octane impl fails loudly rather than
 * producing deceptively-fast numbers.
 */
import type { BenchSuite } from '../runner'

export declare function runOctane(container: HTMLElement): Promise<BenchSuite>
