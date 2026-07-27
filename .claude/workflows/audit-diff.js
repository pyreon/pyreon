export const meta = {
  name: 'audit-diff',
  description: 'Fan out the Pyreon audit lenses over the working diff, then adversarially verify every finding before reporting',
  whenToUse: 'Before opening a PR on a non-trivial change, or when you want findings you can trust rather than a long list of maybes',
  phases: [
    { title: 'Scope', detail: 'determine which lenses the diff actually warrants' },
    { title: 'Audit', detail: 'run applicable lenses concurrently' },
    { title: 'Verify', detail: 'adversarially refute each finding' },
    { title: 'Synthesize', detail: 'rank survivors, name coverage gaps' },
  ],
}

// The plan lives in code, not in a context window: intermediate results stay in
// script variables instead of accumulating in the main conversation.

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'summary', 'failure_scenario', 'class_closed'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          summary: { type: 'string' },
          failure_scenario: { type: 'string', description: 'inputs/state -> wrong output' },
          class_closed: { type: 'boolean', description: 'true if the fix closes the whole bug CLASS, false if it only handles the reproduced shape' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}

const SCOPE = {
  type: 'object',
  required: ['lenses', 'rationale'],
  properties: {
    lenses: {
      type: 'array',
      items: { type: 'string', enum: ['review', 'parity', 'leak'] },
    },
    rationale: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['refuted', 'reasoning'],
  properties: {
    refuted: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
}

// --- Scope -----------------------------------------------------------------
// Running every lens on every diff wastes tokens and dilutes the report. Ask once.

phase('Scope')

const scope = await agent(
  `Run \`git diff origin/main...HEAD --stat\` and \`git diff origin/main...HEAD --name-only\`.
   Decide which audit lenses this diff actually warrants:
   - "review": always applicable to any source change.
   - "parity": only if it touches packages/core/compiler, runtime-dom props/template,
     runtime-server, or makes a browser-behavior claim.
   - "leak": only if it adds a module-level cache/stack/registry, a WeakMap/WeakSet,
     an event listener, a timer, a promise queue, a scratch buffer, or a long-lived closure.
   Return only the lenses that are genuinely warranted, and say why.`,
  { label: 'scope', schema: SCOPE },
)

const lenses = scope?.lenses?.length ? scope.lenses : ['review']
log(`Lenses: ${lenses.join(', ')} — ${scope?.rationale ?? 'defaulted to review'}`)

// --- Audit + Verify --------------------------------------------------------
// pipeline(), not parallel(): each lens's findings start verification as soon as
// that lens returns, instead of waiting on the slowest lens.

phase('Audit')

const AGENT_FOR = { review: 'pyreon-reviewer', parity: 'parity-auditor', leak: 'leak-hunter' }

const perLens = await pipeline(
  lenses,
  (lens) =>
    agent(
      `Audit the working diff (\`git diff origin/main...HEAD\`) using your specialty.
       Report only defects you can substantiate against the actual code.
       For each, set class_closed=false if the fix only handles the reproduced SHAPE
       rather than the whole bug CLASS. Return an empty array if nothing is wrong —
       do not invent findings.`,
      { agentType: AGENT_FOR[lens], label: `audit:${lens}`, phase: 'Audit', schema: FINDINGS },
    ),

  // Each finding is refuted independently, as soon as its lens lands.
  (result, lens) =>
    parallel(
      (result?.findings ?? []).map((f) => () =>
        agent(
          `Try to REFUTE this claimed defect. Read the actual code before deciding.
           Default to refuted=true if you cannot substantiate it.

           File: ${f.file}${f.line ? `:${f.line}` : ''}
           Claim: ${f.summary}
           Claimed failure: ${f.failure_scenario}`,
          { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT, effort: 'high' },
        ).then((v) => ({ ...f, lens, verdict: v })),
      ),
    ),
)

const all = perLens.flat().filter(Boolean)
const confirmed = all.filter((f) => f.verdict && !f.verdict.refuted)
const dropped = all.length - confirmed.length

log(`${confirmed.length} confirmed, ${dropped} refuted and dropped`)

// --- Synthesize ------------------------------------------------------------

phase('Synthesize')

const rank = { high: 0, medium: 1, low: 2 }
confirmed.sort((a, b) => (rank[a.severity] ?? 1) - (rank[b.severity] ?? 1))

return {
  lensesRun: lenses,
  lensesSkipped: ['review', 'parity', 'leak'].filter((l) => !lenses.includes(l)),
  confirmed,
  droppedCount: dropped,
  shapeOnlyFixes: confirmed.filter((f) => f.class_closed === false),
  note: dropped > 0
    ? `${dropped} finding(s) did not survive adversarial verification and were dropped.`
    : 'Every finding survived verification.',
}
