# PMTC user-survey design — market validation alongside the Phase 0 spike

**Status**: Companion to [`native-platforms.md`](./native-platforms.md) (PMTC strategic direction, #764), [`native-platforms-competitors.md`](./native-platforms-competitors.md) (#795 merged), [`native-platforms-phase0-roadmap.md`](./native-platforms-phase0-roadmap.md) (#797 merged).

The competitor survey (#795) named **the biggest open question PMTC doesn't answer**: would current Pyreon users adopt PMTC if it shipped in 2027 with the quality bar described? The PMTC plan's three pass/fail criteria are all technical (type mapper coverage, signal→@State round-trip, style fidelity). None ask whether the audience exists.

This doc designs the market-validation survey that **must run alongside Phase 0** so the "go vs no-go" decision for Phase 1 staffing has both technical AND market evidence.

**Scope**: survey design — what questions, who to ask, how to interpret. **Not in scope**: running the survey (separate execution work).

---

## TL;DR

The survey targets **20-30 current and prospective Pyreon users** with a structured set of 12 questions covering:

1. **Current mobile situation** — do they ship mobile today? How?
2. **Hypothetical PMTC adoption** — would they use Pyreon → SwiftUI/Compose if it shipped Q4 2027?
3. **Deal-breakers** — what would make them reject PMTC even if it shipped on time?
4. **Trade-off tolerance** — what are they willing to give up (OTA updates, ecosystem maturity, hot reload polish) for "truly native"?
5. **Alternative they'd pick if PMTC didn't exist** — Skip / Compose Multiplatform / React Native / Flutter / WebView shell / don't-do-mobile-at-all?

**Decision thresholds** (based on response distribution):

- **≥70% "would adopt"** with ≥50% citing "truly native widgets matter" → Scenario 1 from the competitor survey is real. Staff Phase 1.
- **30-70% "would adopt"** with mixed reasons → ambiguous. Run a follow-up survey after Phase 0 ships the counter app — give respondents something concrete to react to.
- **<30% "would adopt"** OR ≥60% citing "ecosystem" as the deal-breaker → Scenario 3 from the competitor survey. **Don't staff Phase 1.** Reconsider scope (partial-PMTC mode via Compose Multiplatform per #795's recommendation, or accept that mobile is out of Pyreon's scope).

The survey must run **during Phase 0 (months 1-3), with results available at the same time as Phase 0's three technical criteria report**. Staffing Phase 1 is conditional on BOTH passing.

---

## Why the survey matters

The competitor survey (#795) closed with three scenarios:

> **Scenario 1** — the market is real and underserved. Teams writing Pyreon today want native mobile, are picky about native-feel, won't accept WebView compromises, won't rewrite in Kotlin/Swift, won't ship a JS engine on device. PMTC ships in 2-3 years and captures them.
>
> **Scenario 2** — the market exists but is captured by CMP first. CMP's iOS-Skia compromise is invisible to most users.
>
> **Scenario 3** — the market is smaller than assumed. Most teams accept the compromises (WebView, React Native, Flutter). The picky audience is small enough that 2-3 years of compiler investment doesn't pay back.

**The PMTC plan implicitly assumes Scenario 1.** This survey is what tests that assumption.

Without the survey, Phase 1 staffing is a bet on Scenario 1 being true. With the survey, the staffing decision has evidence.

---

## Survey design

### Recruitment

**Target**: 20-30 respondents across these segments:

| Segment                                                                                    | Target count | Why                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active Pyreon users (current `@pyreon/*` consumers identifiable via npm + GitHub)          | 10-15        | The "actual audience" — Pyreon's existing user base                                                                                                        |
| Prospective adopters (signal-framework users — Solid, Svelte 5, recent React-with-signals) | 5-10         | Tests if PMTC pulls users FROM other signal frameworks, not just retains existing Pyreon users                                                             |
| Native-first teams (iOS or Android engineers who currently DON'T use cross-platform tools) | 5-8          | The "non-audience" sanity check — if they're not interested, that's correct; if they ARE interested, PMTC may have broader appeal than the framing assumes |

**Recruitment channels**:

- Pyreon GitHub Discussions (post a public call)
- Pyreon Discord / community channels
- Direct outreach to companies known to ship with `@pyreon/*` (visible via npm + Sentry / Datadog public dashboards if applicable)
- Show HN / Lobsters / Reddit r/reactjs (carefully framed to avoid astroturfing)
- Hacker News "Who's hiring" / "Show HN" responders with related framework interests

**Recruitment incentive**: $25-50 Amazon / Apple gift card per completed response. Total budget: $500-1500. **Without an incentive, response rates drop ~5x**; the cost is trivial vs the strategic decision being made.

### Format

- **30-45 minute structured interview** (synchronous, video call) preferred for the 20 core respondents
- **Async written form** acceptable for the 5-10 supplementary respondents who can't do a call
- Both formats use the same 12 questions
- Recorded with consent; transcribed; coded (see "Analysis" below)

**Why interviews over async-only**: most respondents will give the polite-sounding answer ("yes, I'd adopt") on a form. Interviews surface the specific blockers, trade-offs, and "actually, here's what I'd really do" reasoning that drives the decision.

### The 12 questions

#### Section 1: Current state (3 questions)

**Q1**: "Tell me about your team's current mobile situation. Do you ship a mobile app today? If yes, what framework? If no, why not?"

_What this measures_: are these teams even in PMTC's target market? A team that doesn't want mobile is a definite "no" regardless of PMTC's quality.

**Q2**: "If you ship mobile today: what's your single biggest pain point with your current framework?"

_What this measures_: identifies the gap PMTC would need to close. If everyone says "ecosystem maturity" (RN's pain point), PMTC's pitch is weak. If everyone says "WebView feels janky" or "Flutter widgets don't feel native," PMTC's pitch is strong.

**Q3**: "On a scale of 1-10, how important is 'the iOS app uses real UIKit widgets, not drawn Skia pixels'?"

_What this measures_: tests the central PMTC differentiator. The Flutter precedent suggests most users don't care; this question asks Pyreon's specific audience.

#### Section 2: Hypothetical adoption (3 questions)

**Q4**: "If Pyreon shipped 'write one Pyreon source, compile to native iOS + Android + web — truly native widgets, no JS engine on mobile' in Q4 2027, would you migrate your current mobile work to it? What would change between 'maybe' and 'definitely'?"

_What this measures_: the headline adoption signal. "Maybe" answers are more honest than "yes" — probe what would tip them.

**Q5**: "Imagine PMTC ships in 2027. Two years to ship is the timeline. Would you wait, or would you ship something else in the meantime that you'd then have to migrate from?"

_What this measures_: time-to-market pressure. If most respondents say "we'd ship RN in 2026 and stay there," PMTC's 2-3 year window is too long. If most say "we'd wait — we don't need mobile this year," PMTC's window is acceptable.

**Q6**: "Three things PMTC explicitly gives up: (a) over-the-air updates, (b) the React Native ecosystem of native bindings, (c) Vite-quality hot reload. Which of these is a deal-breaker?"

_What this measures_: which Phase-3 deferred concerns are actually critical. If OTA updates are universal deal-breakers, PMTC's pitch needs to change (or the framework needs a JS engine sidecar mode, which contradicts the core thesis).

#### Section 3: Trade-off tolerance (3 questions)

**Q7**: "Compose Multiplatform ships TODAY with iOS Skia rendering (real Compose widgets on Android; Skia-drawn 'looks like UIKit' widgets on iOS). PMTC ships in 2027 with real SwiftUI on iOS. Which would you pick if both existed in 2027?"

_What this measures_: head-to-head positioning vs the biggest competitor. The honest answer this question reveals is critical: if respondents say "CMP's iOS is fine, ship date matters more," PMTC is over-investing.

**Q8**: "Skip ships today: write Swift+SwiftUI, get an Android app via Kotlin/Compose translation. Source language is Swift not TSX. Would you switch from Pyreon TSX to Swift to get iOS+Android today?"

_What this measures_: how strong the "Pyreon source language" lock-in is. If 80%+ say "no, I want TSX," PMTC's positioning is defensible. If many say "I'd consider Swift if it works today," PMTC's audience is smaller.

**Q9**: "How important is desktop (macOS / Windows / Linux native apps) in your roadmap? PMTC's plan defers desktop to 'future phases' — would you wait for it, or pick Flutter / CMP which ship desktop today?"

_What this measures_: cross-platform desktop demand. If respondents are desktop-curious, PMTC's iOS+Android+web scope is incomplete for their needs.

#### Section 4: Alternatives + commitment (3 questions)

**Q10**: "If PMTC didn't exist and you needed to ship a cross-platform app in 2027, what would you pick? Walk me through your decision."

_What this measures_: the counterfactual. What does Pyreon's audience currently DO? If most pick "Capacitor + web bundle" the bar PMTC needs to clear is low. If most pick "we hire iOS engineers and write Swift," PMTC's pitch is weak.

**Q11**: "Beyond just 'adoption' — would your team contribute to PMTC if Pyreon open-sourced the compiler work? Bug fixes, widget bindings, testing, documentation?"

_What this measures_: community-side support. PMTC's 2-3 year build is expensive; community contribution shortens it materially. If even 20% of respondents say they'd contribute, the staffing math improves.

**Q12**: "What would convince you to publicly bet on PMTC — talk about it at a conference, write a blog post, recommend it to clients?"

_What this measures_: advocacy potential. Adoption is a lagging indicator; advocacy is leading. Frameworks succeed because their early adopters evangelize.

### Anti-design choices

Questions deliberately NOT asked:

- **"Would you pay for PMTC?"** — PMTC is open-source. Pricing isn't the decision.
- **"How much faster do you expect PMTC to be vs React Native?"** — Perf isn't PMTC's pitch (per the plan's explicit non-goal "Match SwiftUI / Compose performance characteristics exactly"). Asking confuses the framing.
- **"What features should PMTC have?"** — Open-ended feature requests are noise. The framework is scoped; the survey validates whether the scope is right, not whether to expand it.
- **"How does PMTC compare to [tool the respondent uses]?"** — Comparison Qs are too leading. Questions 7/8/10 surface comparisons organically.

---

## Analysis framework

### Coding scheme

Each response gets coded against:

| Code                           | Definition                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| **A (Adopt)**                  | Q4 = "yes" or "probably yes" + no deal-breaker in Q6                                     |
| **A-cond (Conditional adopt)** | Q4 = "maybe" + named condition (e.g. "if ecosystem catches up", "if hot reload is fast") |
| **R (Reject)**                 | Q4 = "no" or deal-breaker in Q6                                                          |
| **R-time (Time-rejected)**     | Would adopt eventually but Q5 says ship-something-else first                             |
| **R-eco (Ecosystem-rejected)** | Q6 says "the RN ecosystem is the deal-breaker"                                           |
| **R-OTA (OTA-rejected)**       | Q6 says "no OTA updates is a deal-breaker"                                               |
| **CMP-prefer**                 | Q7 says CMP wins even with Skia compromise                                               |
| **Skip-prefer**                | Q8 says Swift source is acceptable                                                       |
| **Native-real (truly cares)**  | Q3 ≥ 8 AND Q7 = "PMTC even waiting 2 years"                                              |

A single response gets multiple codes. The codes drive the decision math.

### Decision thresholds

**STAFF PHASE 1**:

- ≥70% of responses code as **A** or **A-cond** (with conditions that are reasonable to meet)
- AND ≥50% code as **Native-real** (the central PMTC differentiator is actually valued by half the audience)
- AND ≤20% code as **R-OTA** (the biggest non-fixable deal-breaker isn't dominant)

**RE-SURVEY AFTER PHASE 0 COUNTER SHIP**:

- 30-70% code as **A** or **A-cond**
- Mixed signal on **Native-real** vs **CMP-prefer**
- This means the abstract pitch lands ambiguously — give respondents the counter-on-iOS-simulator demo and re-ask

**DO NOT STAFF PHASE 1**:

- <30% code as **A** or **A-cond**
- OR ≥60% code as **R-eco** (ecosystem deal-breaker; impossible to fix in <5 years)
- OR ≥40% code as **CMP-prefer** even when warned about Skia rendering (PMTC's strategic position is captured)
- OR ≥40% code as **R-time** (ship-something-else-first is the real answer; PMTC is too slow)

In the "do not staff" case, the recommended next actions per the competitor survey (#795):

- Reconsider scope (partial-PMTC mode via Compose Multiplatform target — 6-9mo spike, trades "real widgets on iOS" for ship speed)
- OR accept that mobile is out of Pyreon's scope (focus on web competitive position vs Solid / Svelte)

### Honest read of survey limits

This survey has real limits — name them so the decision-making accounts for them:

1. **Selection bias** — respondents are people interested enough to respond. Silent majority of "don't care" Pyreon users are undercounted. Adjust by recruiting from segments that don't self-select (direct outreach to companies, not just public calls).
2. **Hypothetical bias** — asking "would you adopt X in 2027" is asking about a future state. Real-world adoption depends on circumstances at adoption time (team turnover, budget, framework alternatives at that point) — not at survey time.
3. **Anchoring bias** — once respondents hear PMTC's pitch (Q4), every subsequent question is anchored on it. The order of questions matters; current order leads with hypothetical then probes for honesty.
4. **Sample size** — 20-30 respondents is enough to detect strong signal (70/30 splits) but not weak signal (45/55 splits). If results are in the "ambiguous" band, the re-survey after Phase 0 ship is essential.
5. **One-shot** — runs once, in 2025-2026. Doesn't capture how the market evolves between survey and PMTC ship. The re-survey at Phase 0 ship is the partial mitigation.

---

## Timeline

The survey runs **during Phase 0** (months 1-3 of Phase 0 work), with results available at Phase 0 completion:

| Month           | Activity                                                                              |
| --------------- | ------------------------------------------------------------------------------------- |
| Phase 0 month 1 | Recruitment + scheduling (build the list, send incentives, schedule interviews)       |
| Phase 0 month 2 | Interviews + async responses (target 5-8 interviews/week × 4 weeks = 20-32 responses) |
| Phase 0 month 3 | Coding + analysis (transcribe, code, write up findings)                               |
| End of Phase 0  | Survey results report + go/no-go recommendation                                       |

Phase 1 staffing decision uses BOTH:

- The three Phase 0 technical criteria
- The user survey decision thresholds

Both must green-light. If technical passes but market fails, **don't staff Phase 1** — the market signal is more dispositive than the technical signal.

---

## Cost

| Item                                                                           | Cost           |
| ------------------------------------------------------------------------------ | -------------- |
| Respondent incentives ($25-50 × 20-30)                                         | $500-1500      |
| Transcription (3hr per interview at $20/hr × 20 interviews)                    | $1200          |
| Researcher time (recruiting + interviewing + analysis, ~80hr at internal rate) | Variable       |
| **External cash cost**                                                         | **$1700-2700** |

For a 2-3 year, multi-million-dollar engineering investment, $1700-2700 of survey cost is rounding error. The risk-adjusted expected value of the survey (catching Scenario 3 before Phase 1 staffing = saving 4-6 months of one or two engineers' work = $200k-1M) is overwhelming.

---

## Survey-driven artifacts

When the survey completes, the artifacts to produce:

1. **A new doc**: `.claude/plans/native-platforms-user-survey-results.md` — anonymized aggregate findings, per-code response counts, recommendation (staff Phase 1 / re-survey / don't staff).
2. **An update to**: `.claude/plans/native-platforms.md` — appends a "Market validation results" section with the headline finding.
3. **An update to**: `.claude/plans/native-platforms-competitors.md` — adjusts the Scenario 1/2/3 likelihood based on actual evidence.
4. **A go/no-go recommendation in**: `open-work-2026-q3.md` — Phase 1 staffing line item updates from "TBD pending Phase 0 + survey" to "STAFF" / "RESURVEY" / "DON'T STAFF".

---

## What this doc commits to

- **20-30 respondent target** spanning 3 segments (active users / prospective adopters / native-first teams).
- **12 structured questions** in 4 sections (current state / hypothetical adoption / trade-offs / alternatives).
- **Coding scheme + decision thresholds** that drive a quantitative "STAFF / RESURVEY / DON'T STAFF" recommendation.
- **Timeline overlapping Phase 0** so results are available at Phase 1 staffing decision time.
- **$1700-2700 external cash cost** — trivial vs the staffing decision being made.
- **Honest survey limits named** so the decision accounts for selection bias, hypothetical bias, anchoring bias, small sample, one-shot nature.

## What this doc does NOT commit to

- **Running the survey** — that's separate execution work owned by whoever staffs PMTC.
- **Specific recruitment channels** beyond suggestions — depends on Pyreon community state at survey time.
- **The exact interview script** beyond the 12 anchor questions — real interviews follow the conversation organically.
- **Predicting the results** — the whole point is to gather evidence, not confirm what we already think.

## Recommendation

**Run the survey during Phase 0.** The decision to staff Phase 1 should require BOTH technical pass (Phase 0 criteria) AND market pass (survey thresholds). Without the survey, Phase 1 staffing is a bet on Scenario 1 being true. With the survey, the bet has evidence.

The honest framing for whoever staffs PMTC: the technical work is the easy part of de-risking. The market validation is the hard part — and it's the part nobody on the engineering team can do alone, but everyone (including the team) needs to see the results of before committing 2-3 years of work.
