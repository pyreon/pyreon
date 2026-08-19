/**
 * Type shim for the crossover Octane arm — same rationale as
 * `octane.tsrx.d.ts`: `.tsrx` is a TypeScript SUPERSET that plain `tsc` cannot
 * parse, so without this declaration `tsc --noEmit` fails the whole example
 * with TS2307 on the import. Only the module boundary is typechecked; the body
 * is validated by the harness's per-iteration DOM verification instead
 * (`expectRows` / `expectRowsWithSelected` plus the batch probes' checksum and
 * precondition gates), which is a stronger guarantee than types for a
 * benchmark.
 */
import type { BenchSuite } from '../runner'

export declare function runCrossoverOctane(container: HTMLElement): Promise<BenchSuite>
