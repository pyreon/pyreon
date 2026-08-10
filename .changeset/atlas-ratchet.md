---
'@pyreon/atlas': minor
---

**`--check` — the ratchet. `atlas scan` and `atlas verify` can now answer "did I help?", not just "how is it now?".**

Absolute counts (`14 verified, 1 failing`) answer the second question and cannot answer the first — which is the one anyone iterating actually has, and the only signal an agent can use to decide whether to keep a change or back it out. A single number is not a reward signal; a delta is.

`--check` compares the run against the **committed** `atlas-catalog.json` and exits non-zero on a regression:

```
atlas --check: REGRESSED — 2 check(s) started failing
  ✗ button--empty — now failing: interaction
```

**A check that STOPS RUNNING counts as a regression.** This is the case absolute counts structurally cannot catch, because losing coverage makes the numbers improve. Delete a wrapper from `atlas.config.ts` and every mount-dependent check drops to `skip`:

```
atlas: discovered 1 component(s), 2 scenario(s) — 0 verified, 0 failing, 2 unverified.
atlas --check: REGRESSED — 4 check(s) stopped running
  ✗ button--empty — no longer checked: interaction, leak
    (coverage lost — the failure did not go away, the check did)
```

`2 failing` became `0 failing` and the catalog reads as fixed. Losing coverage is the one way to "fix" a red catalog that must never read as green.

Three deliberate behaviours: `--check` never writes the catalog (a ratchet that overwrites its own baseline compares a run against itself and can never report a regression again); a missing or unreadable baseline is exit 0 with a note, never a failure (making the first `--check` run red for everybody is how a ratchet gets disabled on day one); and a new or removed scenario is not a regression (adding a component with a failing edge case is new information, deleting one is a legitimate edit).

The diff is per CHECK rather than per scenario — "still failing" and "failing for a different reason" are different events — and iterates `CHECK_KEYS`, so a seventh check is ratcheted the day it lands.
