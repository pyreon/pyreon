// The doctor gate NAME registry — deliberately dependency-free.
//
// These lists used to live in `orchestrator.ts`, which statically imports
// every gate IMPLEMENTATION (`./gates` → the compiler → the TypeScript API).
// `src/index.ts` imported the lists eagerly for `--help` text and arg
// validation, which dragged that entire graph into EVERY CLI invocation:
// `pyreon doctor --help` measured 45.8s wall to print a usage string, and
// the dependency-fabric gate's discoverability spec (which shells that
// command) timed out under the Coverage (Full) run — the failure that
// surfaced this. The heavy-eager-import class: a heavy module on a cheap
// entry's static path (see anti-patterns "Static VALUE-import of a heavy
// module … reachable from a cheap entry point").
//
// The rule this file enforces by construction: NAMES are cheap, and anything
// `--help` needs must stay cheap. Gate implementations load behind the
// command dispatch's `await import('./doctor')`, never from here.

export type GateName =
  | 'react-patterns'
  | 'pyreon-patterns'
  | 'lint'
  | 'distribution'
  | 'doc-claims'
  | 'audit-tests'
  | 'islands-audit'
  | 'dependency-fabric'
  | 'ssg-audit'
  | 'content-audit'
  | 'native-audit'
  | 'check-dedup'
  | 'audit-leak-classes'
  | 'audit-types'
  | 'bundle-budgets'

/** Gates that run by default (fast). */
export const FAST_GATES: GateName[] = [
  'react-patterns',
  'pyreon-patterns',
  'lint',
  'distribution',
  'doc-claims',
  'islands-audit',
  'dependency-fabric',
  'ssg-audit',
  'content-audit',
  'native-audit',
  'audit-tests',
  'check-dedup',
  'audit-leak-classes',
]

/** Gates that require `--full` to enable. */
export const SLOW_GATES: GateName[] = ['audit-types', 'bundle-budgets']
