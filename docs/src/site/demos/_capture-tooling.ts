/**
 * The `pyreon doctor` run the Tooling demo simulates (DemoTooling.tsx).
 *
 * SIMULATED run, REAL vocabulary (checked against the source, 2026-11-11):
 *   - codes and messages: the lint rules' own `context.report` messages
 *     (packages/tools/lint/src/rules/{jsx,reactivity,performance}/…), the
 *     check-dedup gate (packages/tools/cli/src/doctor/gates/check-dedup.ts)
 *     and the SSG audit (packages/core/compiler/src/ssg-audit.ts); doctor
 *     prefixes lint findings `lint/<ruleId>` and gate findings `<gate>/<code>`.
 *   - auto-fixable: the rules whose meta says `fixable: true`
 *     (no-classname, no-signal-call-write).
 *   - skip reasons: verbatim from gates/doc-claims.ts and
 *     gates/audit-leak-classes.ts; "enable with --full" from orchestrator.ts.
 *   - scoring and layout: doctor/score.ts (error 10, warning 3, info 1 per
 *     category, clamped 0..100; A ≥90 … F) and doctor/render/text.ts.
 * The app (src/Inbox.tsx, …) and its line numbers are the simulation.
 */
export type Severity = 'error' | 'warning' | 'info'
export type Category = 'correctness' | 'performance' | 'architecture' | 'testing'

export interface DoctorFinding {
  id: string
  severity: Severity
  category: Category
  code: string
  message: string
  location: string
  /** The `fix:` line doctor prints, when the gate supplies one. */
  fix?: string
  /** Fixed by `pyreon doctor --fix` (the rule's autofix). */
  auto: boolean
}

export const FINDINGS: readonly DoctorFinding[] = [
  {
    id: 'destructure',
    severity: 'error',
    category: 'correctness',
    code: 'lint/pyreon/no-props-destructure',
    message: 'Destructured props in component function — breaks reactive prop tracking. Use `props` parameter and access as props.title.',
    location: 'src/Inbox.tsx:5:22',
    auto: false,
  },
  {
    id: 'classname',
    severity: 'error',
    category: 'correctness',
    code: 'lint/pyreon/no-classname',
    message: 'Use `class` instead of `className` — Pyreon uses standard HTML attributes.',
    location: 'src/Counter.tsx:5:17',
    auto: true,
  },
  {
    id: 'signal-write',
    severity: 'error',
    category: 'correctness',
    code: 'lint/pyreon/no-signal-call-write',
    message:
      '`count(value)` does NOT write the signal — `signal()` is the read-only callable surface and ignores its arguments. Use `count.set(value)` or `count.update((prev) => …)`.',
    location: 'src/Counter.tsx:5:48',
    auto: true,
  },
  {
    id: 'map',
    severity: 'warning',
    category: 'correctness',
    code: 'lint/pyreon/no-map-in-jsx',
    message: '`.map()` in JSX — use `<For>` for reactive list rendering instead.',
    location: 'src/TodoList.tsx:4:14',
    auto: false,
  },
  {
    id: 'dedup',
    severity: 'error',
    category: 'architecture',
    code: 'check-dedup/multiple-versions',
    message:
      '@pyreon/core resolves to 2 distinct versions in the lockfile (0.52.0, 0.53.0). Multiple module instances of the same Pyreon package break framework contracts (signal tracking, lifecycle hooks, context propagation). The runtime sentinel will throw on first dual-load.',
    location: 'bun.lock',
    fix: 'Pin a single version: `bun add @pyreon/core@<version>` (or `npm install` / `pnpm install`) and remove the conflicting transitive entries from your lockfile. For workspace projects, ensure every internal consumer uses `workspace:^` for the dep. Set PYREON_SINGLE_INSTANCE=warn to demote the runtime throw to a warning while you migrate.',
    auto: false,
  },
  {
    id: 'ssg',
    severity: 'warning',
    category: 'architecture',
    code: 'ssg-audit/dynamic-route-missing-get-static-paths',
    message:
      "Dynamic route \"[slug].tsx\" has no `getStaticPaths` export — under `mode: 'ssg'` the auto-detect step SILENTLY SKIPS this route, so the dist won't contain prerendered HTML. Either add `export const getStaticPaths = () => [{ params: { ... } }, ...]` enumerating the concrete values, OR opt the route out of prerendering with `export const renderMode = 'spa'` (a client-rendered shell for any param; 'ssr'/'isr' need the app to be `mode: 'ssr'/'isr'`).",
    location: 'src/routes/blog/[slug].tsx:1:1',
    auto: false,
  },
  {
    id: 'effect-in-for',
    severity: 'warning',
    category: 'performance',
    code: 'lint/pyreon/no-effect-in-for',
    message: '`effect()` inside `<For>` — this creates a new effect for every item on each reconciliation. Lift the effect outside.',
    location: 'src/Feed.tsx:88:9',
    auto: false,
  },
]

/** renderSkipped's line for the gates that did not run, reasons verbatim. */
export const SKIPPED =
  'doc-claims (doc-claim audit targets the Pyreon monorepo (scripts/check-doc-claims.ts not present here)), ' +
  'audit-leak-classes (leak-class audit targets the Pyreon monorepo (scripts/audit-leak-classes.ts not present here)), ' +
  'audit-types (enable with --full), bundle-budgets (enable with --full)'
