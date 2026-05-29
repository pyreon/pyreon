# PMTC User Survey — analysis spreadsheet schema

> The coding scheme from [`native-platforms-user-survey.md`](../native-platforms-user-survey.md) operationalized as a real spreadsheet you can build in Google Sheets / Numbers / Excel. Decision thresholds become formulas; codes become columns.
>
> Tab structure: **Responses** (one row per respondent, raw + coded) → **Aggregate** (the threshold math) → **Quotes** (notable verbatims for the eventual decision memo).

---

## Tab 1: Responses

One row per completed response. Columns split into:

- **Metadata** (provenance, not for analysis)
- **Raw answers** (verbatim or numeric inputs)
- **Codes** (analyst-derived; the math operates on these)

### Metadata columns (A-H)

| Col | Header             | Type   | Source                                                            |
| --- | ------------------ | ------ | ----------------------------------------------------------------- |
| A   | `respondent_id`    | string | Auto-generated (R001, R002, ...)                                  |
| B   | `interviewer`      | string | Live-call interviewer name; "async" for self-administered         |
| C   | `interview_date`   | date   | YYYY-MM-DD                                                        |
| D   | `format`           | enum   | live / async                                                      |
| E   | `segment`          | enum   | A / B / C (per recruitment doc)                                   |
| F   | `name_or_anon`     | string | "Anna Lee (Acme)" or "anonymous" per quote-attribution permission |
| G   | `quote_permission` | enum   | full / anonymized / none                                          |
| H   | `followup_consent` | enum   | yes / maybe / no                                                  |

### Raw answer columns (I-T)

| Col | Header                | Type         | From                                                                                  |
| --- | --------------------- | ------------ | ------------------------------------------------------------------------------------- |
| I   | `q1_mobile_situation` | text         | Q1 raw response                                                                       |
| J   | `q2_pain_point`       | text         | Q2 raw response                                                                       |
| K   | `q3_uikit_score`      | number 1-10  | Q3                                                                                    |
| L   | `q3b_uikit_reasoning` | text         | Q3 follow-up                                                                          |
| M   | `q4_headline_adopt`   | enum         | "definitely yes" / "probably yes" / "maybe" / "probably no" / "definitely no" / "N/A" |
| N   | `q4b_tip_condition`   | text         | Q4 follow-up                                                                          |
| O   | `q5_time_pressure`    | enum         | "wait" / "ship-and-migrate" / "ship-and-stay" / "ship-elsewhere"                      |
| P   | `q5b_alt_framework`   | text         | The framework named in Q5b                                                            |
| Q   | `q6_dealbreakers`     | enum (multi) | OTA / eco / hot / none                                                                |
| R   | `q7_vs_cmp`           | enum         | "PMTC" / "CMP" / "depends" / "neither"                                                |
| S   | `q8_vs_skip`          | enum         | "no-switch" / "skip-yes" / "skip-evaluated-no" / "skip-using"                         |
| T   | `q9_desktop`          | enum         | "blocker" / "nice" / "noprio"                                                         |
| U   | `q10_counterfactual`  | enum         | RN / Flutter / CMP / Skip / Capacitor / Tauri / Native / Hire / Other                 |
| V   | `q11_contribute`      | enum         | "yes" / "conditional" / "no"                                                          |
| W   | `q12_advocacy`        | enum         | "now" / "conditional" / "no"                                                          |

### Code columns (X-AG) — analyst-derived

These are the load-bearing columns. The coding scheme from the survey doc lives here.

| Col | Header             | Formula                                                                                   | Definition                                                  |
| --- | ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| X   | `code_A_adopt`     | `=IF(OR(M="definitely yes", M="probably yes"), AND(NOT(Q includes deal-breaker)), false)` | A = yes/probably-yes + no deal-breaker                      |
| Y   | `code_A_cond`      | `=IF(M="maybe", true, false)` AND named condition in N                                    | A-cond = maybe with named condition                         |
| Z   | `code_R`           | `=IF(OR(M="definitely no", M="probably no"), true, false)`                                | R = no/probably-no                                          |
| AA  | `code_R_time`      | `=IF(O="ship-and-stay", true, false)`                                                     | R-time = would adopt later but ship-and-stay                |
| AB  | `code_R_eco`       | `=IF(Q includes "eco", true, false)`                                                      | R-eco = RN ecosystem is deal-breaker                        |
| AC  | `code_R_OTA`       | `=IF(Q includes "OTA", true, false)`                                                      | R-OTA = OTA is deal-breaker                                 |
| AD  | `code_CMP_prefer`  | `=IF(R="CMP", true, false)`                                                               | CMP-prefer = picks CMP head-to-head                         |
| AE  | `code_Skip_prefer` | `=IF(S="skip-yes", true, false)`                                                          | Skip-prefer = would consider Swift source                   |
| AF  | `code_Native_real` | `=IF(AND(K>=8, R="PMTC"), true, false)`                                                   | Native-real = high UIKit-importance + PMTC-prefers over CMP |
| AG  | `code_contribute`  | `=IF(V="yes", true, false)`                                                               | Contribute-yes = would contribute                           |

---

## Tab 2: Aggregate

The decision threshold math, evaluated against the response set.

### Section: Counts (top of sheet)

```
Total responses:               =COUNTA(Responses!A:A) - 1     // -1 for header
Active mobile users:            =COUNTIF(Responses!I:I, "<>")  // Q1 has content
Live interviews:                =COUNTIF(Responses!D:D, "live")
Async responses:                =COUNTIF(Responses!D:D, "async")
```

### Section: Decision thresholds (the core math)

Per `native-platforms-user-survey.md` decision thresholds:

#### Threshold 1: ≥70% Adopt/Adopt-cond (STAFF gate)

```
Adopt count:                    =COUNTIF(Responses!X:X, true) + COUNTIF(Responses!Y:Y, true)
Adopt %:                        =Adopt count / Total responses
Gate: passes if ≥70%:           =IF(Adopt% >= 0.70, "✓ PASS", "✗ FAIL")
```

#### Threshold 2: ≥50% Native-real (CENTRAL value-prop validation)

```
Native-real count:              =COUNTIF(Responses!AF:AF, true)
Native-real %:                  =Native-real count / Total responses
Gate: passes if ≥50%:           =IF(Native-real% >= 0.50, "✓ PASS", "✗ FAIL")
```

#### Threshold 3: ≤20% R-OTA (non-fixable deal-breaker)

```
R-OTA count:                    =COUNTIF(Responses!AC:AC, true)
R-OTA %:                        =R-OTA count / Total responses
Gate: passes if ≤20%:           =IF(R-OTA% <= 0.20, "✓ PASS", "✗ FAIL")
```

### Section: STAFF / RE-SURVEY / DO-NOT-STAFF decision

```
STAFF if all three gates pass:
  =IF(AND(Threshold1=PASS, Threshold2=PASS, Threshold3=PASS), "STAFF PHASE 1", continue...)

DO-NOT-STAFF triggers (per the survey doc):
  - <30% Adopt count
  - ≥60% R-eco
  - ≥40% CMP-prefer (PMTC-positioned-as-loser)
  - ≥40% R-time

  =IF(OR(
      Adopt% < 0.30,
      COUNTIF(Responses!AB:AB, true)/Total >= 0.60,
      COUNTIF(Responses!AD:AD, true)/Total >= 0.40,
      COUNTIF(Responses!AA:AA, true)/Total >= 0.40
    ), "DO NOT STAFF", continue...)

RE-SURVEY otherwise:
  =IF(AND(Adopt% >= 0.30, Adopt% < 0.70), "RE-SURVEY AFTER PHASE 0 COUNTER SHIP", "INDETERMINATE")
```

### Section: Secondary signals (informational)

```
Contributing users:             =COUNTIF(Responses!AG:AG, true)
Contributing %:                 =Contributing count / Total responses
  (No threshold — strictly informational signal for staffing math)

CMP-prefer count:               =COUNTIF(Responses!AD:AD, true)
Skip-prefer count:              =COUNTIF(Responses!AE:AE, true)
Desktop-blocker count:          =COUNTIF(Responses!T:T, "blocker")
```

### Section: Segment cross-tab

The same gates evaluated per recruitment segment. If Segment A (active Pyreon
users) passes but Segment B (signal-framework outsiders) fails, the staffing
decision changes (PMTC would serve existing users only, not grow the audience).

```
Segment A Adopt%:               =SUMIFS(... X=true, Segment=A) / COUNTIFS(... Segment=A)
Segment B Adopt%:               (same shape)
Segment C Adopt%:               (same shape)
```

If the per-segment numbers diverge sharply (>20pp gap), surface that in the
decision memo — the headline number averages over segments that should be
weighted differently.

---

## Tab 3: Quotes

For the eventual decision memo, capture verbatims that anchor the analysis.
A row per quote-worthy statement (NOT one per respondent).

| Col | Header            | Type                                                                  |
| --- | ----------------- | --------------------------------------------------------------------- |
| A   | `respondent_id`   | string (FK to Responses tab)                                          |
| B   | `attribution`     | enum (full / anonymized / no-quote)                                   |
| C   | `topic_code`      | enum (Q1-Q12 + bonus)                                                 |
| D   | `verbatim`        | text (the exact quote)                                                |
| E   | `analyst_note`    | text (why it's significant)                                           |
| F   | `approval_status` | enum (pending / approved / rejected) — for quote-attribution workflow |

The decision memo cites Tab 3 quotes by `respondent_id`; the approval column
tracks whether the named quote has been re-confirmed for publication.

---

## Tab 4: Recruitment tracking (operational)

Day-to-day tracking of outreach. Distinct from the analysis tabs.

| Col | Header                                              |
| --- | --------------------------------------------------- |
| A   | candidate_id                                        |
| B   | segment (A/B/C)                                     |
| C   | name                                                |
| D   | org                                                 |
| E   | channel (email / Twitter / forum / referral)        |
| F   | outreach_date                                       |
| G   | status (pending / declined / scheduled / completed) |
| H   | notes                                               |

Review weekly: are segments tracking to target (10-15 / 5-10 / 5-8)? If not,
adjust outreach weights.

---

## Setup checklist (one-time, before respondent #1)

- [ ] Spreadsheet created with all four tabs
- [ ] Header row in each tab matches this schema
- [ ] Threshold formulas in Tab 2 evaluate correctly against zero data (should show "0%" / "FAIL")
- [ ] Tab 3 + Tab 4 share `respondent_id` as a foreign key (no orphan IDs)
- [ ] Recipient address: choose Google Sheets (free, sharable) OR Numbers/Excel (offline)
- [ ] Backup policy: daily auto-save + weekly export to CSV (paranoia about sheet-rot)

---

## Anti-design choices (carry from parent doc)

- **Do NOT include the threshold values inline with the question prompts** — biases interviewers toward "passing" the gate.
- **Do NOT publish Tab 3 quotes without each quoted respondent's explicit re-confirmation** at publication time. People's positions evolve; surprising them with a stale quote burns trust.
- **Do NOT analyze in real-time** — let responses accumulate to N≥20 before running thresholds. Early-bird responders are typically the enthusiastic minority; mid-batch is more representative.
- **Do NOT publish the decision memo until 4 weeks after survey close** — gives quoted respondents time to approve.

---

## Output deliverable (the decision memo)

After analysis, the memo's structural template:

```
# PMTC Phase 1 Staffing Decision — <YYYY-MM-DD>

## Decision

  STAFF PHASE 1 / DO NOT STAFF / RE-SURVEY AFTER PHASE 0 COUNTER SHIP

## Evidence

  - Total responses: N (Live: M, Async: M2)
  - Adopt %: __%
  - Native-real %: __%
  - R-OTA %: __%
  - Segment cross-tab: A=__%, B=__%, C=__%

## What the data shows

  <2-4 sentences naming the dominant signal>

## What the data doesn't show

  <1-2 sentences naming the gaps the survey didn't address>

## Anchoring quotes

  <3-5 verbatims from Tab 3, each with respondent_id + topic_code>

## Recommended next actions

  - If STAFF: open the Phase 1 chain A/B/C work per `native-platforms-phase1-roadmap.md`
  - If DO NOT STAFF: per `native-platforms-competitors.md` — reconsider scope
    (partial-PMTC mode via CMP target, OR accept mobile out of scope)
  - If RE-SURVEY: ship counter demo first, then re-run the survey post-demo
```
