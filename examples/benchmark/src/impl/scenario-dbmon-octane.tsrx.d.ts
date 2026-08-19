/**
 * Type shim for the Octane dbmon arm — same rationale as `octane.tsrx.d.ts`.
 *
 * `.tsrx` is Octane's own TypeScript SUPERSET (`@{ … }` component bodies,
 * `@for (… ; index … ; key …)` blocks), so plain `tsc` cannot parse it and the
 * `typecheck` gate would fail the whole example with TS2307 on the import.
 * This declares the module's public surface for `tsc` only.
 *
 * The tradeoff is the same and worth restating: the BODY of the `.tsrx` is not
 * typechecked by our gate, only this boundary. What actually validates it is
 * stronger than types — `verifyDbmon` re-reads cell text AND threshold class
 * from the real DOM after every single iteration, so an Octane arm that
 * renders less, or commits late, fails the run instead of posting a fast
 * number.
 */
import type { DbmonTarget } from './scenario-dbmon'

export declare function createOctaneDbmonTarget(container: HTMLElement): Promise<DbmonTarget>
