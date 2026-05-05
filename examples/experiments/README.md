# Experiments

Bounded prototypes that answer ONE yes/no question about a possible architectural or algorithmic change to Pyreon. Tracking: [`.claude/plans/open-work-2026-q3.md`](../../.claude/plans/open-work-2026-q3.md) (P3 section lists which experiments have run and which are open).

## Layout

Each experiment lives in `examples/experiments/<slug>/` and is self-contained:

```
examples/experiments/
  <slug>/
    RESULTS.md         # the deliverable — see template below
    package.json       # scoped @pyreon/experiment-<slug>
    src/               # whatever the experiment needs
    results/
      <baseline-sha>.json   # raw measurements per run
```

Experiments are **throwaway by default**. The deliverable is `RESULTS.md`, not running code. After the experiment graduates / is killed / is deferred, the directory may be removed (with `RESULTS.md` archived into the plan doc) or kept for reproducibility.

## Branch naming

Branches use `chore/experiment-e<n>-<slug>` (the repo's `chore/` prefix is enforced by `.claude/scripts/guard-branch-name.sh`). Example: `chore/experiment-e1-speculative-mountfor`.

## Workflow

1. Read the plan section for your experiment (e.g. E1, E2…) — the question + GRADUATE / KILL criteria are written there before you start.
2. Create branch: `git checkout -b chore/experiment-e<n>-<slug> origin/main`.
3. Create `examples/experiments/<slug>/` with the template `RESULTS.md` below.
4. Build the smallest thing that answers the question. Do not expand scope — write tangents as follow-up experiments in the plan, don't fold them in.
5. Run the experiment, fill `RESULTS.md` as you go (capture decisions in real time, don't batch).
6. Apply the decision rubric: GRADUATE → write RFC + PR series; KILL → keep `RESULTS.md` as postmortem; DEFER → note in plan and move on.
7. PR back to main with `RESULTS.md` always; experiment code only if it might be picked up later.

## RESULTS.md template

```markdown
# E<n>: <Title>

## Question

<The single yes/no question this experiment answers. Copied from the plan.>

## GRADUATE / KILL criteria

<Copied verbatim from the plan. Do not move goalposts.>

## Method

<Concrete steps. Enough detail that someone else could re-run.>

## Baseline

- Baseline SHA: `<sha>`
- Baseline measurements: `results/<sha>-baseline.json`
- Notes: <hardware, OS, anything that affects reproducibility>

## Experiment runs

| Run | SHA | Wall-clock (median / p90) | Counters delta vs baseline | Notes |
|-----|-----|---------------------------|----------------------------|-------|
| 1   | ... | ...                       | ...                        | ...   |

## Decision

**Outcome**: GRADUATE | KILL | DEFER

**Reasoning**: <which criteria were hit / missed, with numbers.>

**Follow-up**: <RFC link, follow-up experiments to file, or "none — postmortem only".>
```

## Result JSON schema

Every experiment writes one JSON file per measurement run to `results/<sha>.json`. Schema (see [`result-schema.ts`](./result-schema.ts) for the typed version):

```json
{
  "experiment": "e1-speculative-mountfor",
  "sha": "abc123...",
  "baseline_sha": "def456...",
  "wall_clock": {
    "create_1k": { "median": 9.2, "p90": 11.1, "samples": 50 }
  },
  "counters": {
    "runtime.mount": 1023,
    "mountFor.lisOps": 0
  },
  "heap": {
    "after_test": 18.3
  },
  "subjective": {
    "feels_instant": 4
  },
  "decision": "GRADUATE",
  "decision_notes": "..."
}
```

The shared `bun run perf:diff` (in `@pyreon/perf-harness`) compares two such files. CI workflow `.github/workflows/perf.yml` posts the delta to the PR.

## Disciplines

- **Always report median + p90 + sample count, never a single number.** Perf measurements under multi-process load are noisy.
- **Subjective metrics need ≥3 testers** OR a quantified proxy (e.g. "time to first interaction" instead of "feels instant").
- **Capture decisions in real time** in `RESULTS.md` — don't batch the writeup at the end.
- **When in doubt, kill the experiment.** Plans like this fail more often from "we'll just keep going" than from "we stopped too early."
- **Compounding wins are not additive by default** — two experiments that each show +10% might not stack to +20%. Combination tests are required before any multi-win claim.
