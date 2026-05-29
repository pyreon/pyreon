# PMTC User Survey — operational materials

> Source-of-truth design: [`../native-platforms-user-survey.md`](../native-platforms-user-survey.md). This directory turns that design into **ready-to-use artifacts** — anyone can pick this up and run the survey without redesigning anything.
>
> Per the open-work index PMTC section, the user survey is the **biggest non-engineering blocker** for Phase 1 staffing. Phase 0 has shipped technical proof; this directory removes the last "we haven't designed it yet" friction from the market-validation side.

## Files

| File                                                                       | What it is                                                                                  | Who reads it      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------- |
| [`01-survey-form.md`](./01-survey-form.md)                                 | Interview script for live (30-45 min video) calls                                           | Interviewers      |
| [`02-survey-form-async.md`](./02-survey-form-async.md)                     | Self-administered form (15-20 min) — paste into Tally / Typeform / Google Forms verbatim    | Survey-tool admin |
| [`03-recruitment-templates.md`](./03-recruitment-templates.md)             | Copy-paste outreach emails / DMs / forum posts for the 3 respondent segments                | Recruiter         |
| [`04-analysis-spreadsheet-schema.md`](./04-analysis-spreadsheet-schema.md) | Spreadsheet column schema + threshold formulas + segment cross-tab + decision-memo template | Analyst           |

## How to run the survey (operational checklist)

### Week 1 — Setup

- [ ] Create the survey-tool form using [`02-survey-form-async.md`](./02-survey-form-async.md) verbatim
- [ ] Create the analysis spreadsheet using [`04-analysis-spreadsheet-schema.md`](./04-analysis-spreadsheet-schema.md)
- [ ] Build candidate lists per segment (see [`03-recruitment-templates.md`](./03-recruitment-templates.md) for sourcing channels):
  - Segment A: 30 candidates → target 10-15 responses
  - Segment B: 20 candidates → target 5-10 responses
  - Segment C: 15 candidates → target 5-8 responses
- [ ] Set up calendly (or equivalent) for live-interview booking
- [ ] Allocate honorarium budget — $50 USD × 25 respondents = ~$1,250 (low estimate)

### Weeks 2-3 — Outreach

- [ ] Send Segment A outreach (highest-priority — they're existing users)
- [ ] Wait 5 days, then Segment B
- [ ] Wait 3 more days, then Segment C
- [ ] **Daily**: review recruitment tracker (Tab 4 of the analysis spreadsheet); replace declined / silent candidates from the buffer list

Public posts (forum / Twitter public) are last-resort — only if direct outreach falls short of 15 responses by mid-week 3.

### Week 4 — Interviews + analysis

- [ ] Run live interviews on booked Calendly slots
- [ ] Daily: fill in Tab 1 row of analysis spreadsheet within 24 hours of each completed response (live + async)
- [ ] Once N≥20: run Tab 2 threshold math
- [ ] Capture quote-worthy verbatims in Tab 3
- [ ] Request quote-attribution re-confirmation from any respondent we'd cite by name

### Week 5 — Decision memo

- [ ] Draft the decision memo using the template at the end of [`04-analysis-spreadsheet-schema.md`](./04-analysis-spreadsheet-schema.md)
- [ ] Circulate internally for review (NOT externally — quotes need re-confirmation first)
- [ ] After quote re-confirmation, share with respondents who opted in to receive aggregate results
- [ ] If STAFF: open the first Phase 1 chain A/B/C PRs per [`../native-platforms-phase1-roadmap.md`](../native-platforms-phase1-roadmap.md)
- [ ] If DO NOT STAFF: open a doc on the alternate path (partial-PMTC via CMP target / accept mobile-out-of-scope)

## Cost reality check

Per the source design ([`native-platforms-user-survey.md`](../native-platforms-user-survey.md) §Cost):

| Line item                                 | Low estimate                   | High estimate  |
| ----------------------------------------- | ------------------------------ | -------------- |
| Honoraria (25 × $50)                      | $1,250                         | $1,500         |
| Survey tool (Tally free OR Typeform paid) | $0                             | $59/mo × 1     |
| Calendly                                  | $0                             | $0 (free tier) |
| Interviewer time (12 live × 45min + prep) | 15 hrs of non-engineering time | 25 hrs         |
| Analysis time                             | 5 hrs                          | 10 hrs         |
| **Total cash**                            | **~$1,250**                    | **~$1,560**    |

Engineering time cost is zero. Total: **1 part-time non-engineering owner for 4-5 weeks**.

## Honesty about what this directory IS and ISN'T

**IS**:

- Operational artifacts that turn the design doc into a runnable survey
- Copy-paste templates that don't require interpretation
- Spreadsheet schema that operationalizes the decision thresholds

**ISN'T**:

- A commitment to actually run the survey (that decision is still open per the open-work index)
- A guarantee about response rate or signal quality (the [survey design's "Honest read of survey limits"](../native-platforms-user-survey.md#honest-read-of-survey-limits) still applies)
- An update to the Phase 1 staffing decision (the survey hasn't run; this directory just lets it run)

When someone decides to actually run it, this directory removes ~1-2 weeks of design-from-scratch friction. That's the value.
