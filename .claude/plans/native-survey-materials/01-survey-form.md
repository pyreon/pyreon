# PMTC User Survey — interview script

> Source-of-truth: this file. The interviewer reads from it during 30-45 minute video calls. Companion form for async respondents lives at [`02-survey-form-async.md`](./02-survey-form-async.md) — same questions, written for self-administered completion.

## Pre-interview (5 min)

**Greeting**:

> Thanks for taking the time. I'm researching native-mobile build strategy for Pyreon (the signal-based JS framework). This is 30-45 minutes; I'll record audio for my notes only — no public sharing without your written permission. Sound good?

**Consent prompts**:
- [ ] Audio recording permission (yes / no / "off the record" for specific moments)
- [ ] Quote attribution permission (full name + company / anonymized / no quoting)
- [ ] Follow-up contact permission (yes / no)

**Establish context (probe lightly)**:
- What's your current role + company?
- What does your team primarily ship — web, mobile, both, something else?
- Are you a Pyreon user today? If yes — what version, what type of app?

The context probe shapes which questions weight heavier in analysis (Section 1 weighs more for non-users; Section 3 weighs more for shipped-mobile teams).

---

## Section 1 — Current state (10 min)

### Q1 — Mobile situation today

> **Tell me about your team's current mobile situation. Do you ship a mobile app today? If yes, what framework? If no, why not?**

**Follow-up prompts** (use as needed):
- How long have you been on that framework?
- What did you replace, if anything?
- If "no" — is mobile on your roadmap at all, or never?

**Code (for analysis)**:
- [ ] Ships mobile today (RN / Flutter / Native / Capacitor / CMP / other:____)
- [ ] Planning mobile in next 12 months
- [ ] Not in roadmap
- [ ] Doesn't apply (no mobile interest)

### Q2 — Single biggest pain point with current framework

> **If you ship mobile today: what's your single biggest pain point with your current framework?**

**Follow-up prompts**:
- What workaround do you currently use?
- How would you describe the pain to a coworker?
- On a scale of 1-10, how much does this pain block you shipping?

**Code (single primary pain — pick the dominant one)**:
- [ ] Bundle size / startup time
- [ ] Hot reload / dev-loop speed
- [ ] Ecosystem maturity (missing native modules)
- [ ] WebView / Skia rendering feels janky
- [ ] Native widget mismatch (doesn't look like the platform)
- [ ] Build configuration / tooling
- [ ] Type safety / compile-time guarantees
- [ ] Performance at scale
- [ ] OTA update story
- [ ] Other: __________________

### Q3 — Importance of real-UIKit widgets

> **On a scale of 1-10, how important is "the iOS app uses real UIKit widgets, not drawn Skia pixels"?**

**Follow-up prompts** (whatever the number):
- What experience drove that score?
- Have your users ever complained about widget feel?
- Have you ever rejected a framework because of this?

**Code**:
- [ ] Score: ___ / 10
- [ ] Verbatim reasoning: ____________________________________

---

## Section 2 — Hypothetical adoption (15 min)

### Q4 — Headline adoption signal

> **If Pyreon shipped "write one Pyreon source, compile to native iOS + Android + web — truly native widgets, no JS engine on mobile" in Q4 2027, would you migrate your current mobile work to it?**

**Follow-up prompts**:
- What would change between "maybe" and "definitely"?
- What would change between "maybe" and "no"?
- If "yes" — how concretely? Production app, side project, evaluation only?

**Code**:
- [ ] **A** (Adopt) — yes / probably yes, no major blockers
- [ ] **A-cond** (Conditional adopt) — maybe with named conditions: ____________
- [ ] **R** (Reject) — no, regardless of detail
- [ ] **Unclear** — answer needs follow-up

### Q5 — Time-to-market pressure

> **Imagine PMTC ships in 2027. Two years from now. Would you wait, or would you ship something else in the meantime that you'd then have to migrate from?**

**Follow-up prompts**:
- If "ship something else" — what would you ship?
- Would migration cost block you from later switching?
- If "wait" — what does your team do in the meantime?

**Code**:
- [ ] **Wait** — comfortable waiting; no immediate ship pressure
- [ ] **Ship-and-migrate** — would ship X in 2026, willing to migrate to PMTC later
- [ ] **R-time** — would ship X in 2026 and STAY there; PMTC arrives too late
- [ ] **Ship-elsewhere** — would pick a different framework that ships sooner
- [ ] Named "X" framework if applicable: ____________

### Q6 — Three deal-breakers PMTC accepts

> **Three things PMTC explicitly gives up: (a) over-the-air updates, (b) the React Native ecosystem of native bindings, (c) Vite-quality hot reload. Which of these is a deal-breaker for your team?**

**Follow-up prompts** (per deal-breaker):
- For OTA: are you required by compliance or just by team workflow?
- For ecosystem: which specific native module(s) are you using that PMTC would need to replicate?
- For hot reload: how often do you hit the dev loop? How fast is "fast enough"?

**Code (check all that apply)**:
- [ ] **R-OTA** — OTA updates are a deal-breaker
- [ ] **R-eco** — RN ecosystem is a deal-breaker
- [ ] **R-hot** — hot reload speed is a deal-breaker
- [ ] **None** — all three are acceptable
- [ ] Specific native modules they'd need: ____________

---

## Section 3 — Trade-off tolerance (10 min)

### Q7 — vs Compose Multiplatform (the biggest competitor)

> **Compose Multiplatform ships TODAY with iOS Skia rendering — real Compose widgets on Android, Skia-drawn "looks like UIKit" widgets on iOS. PMTC ships in 2027 with REAL SwiftUI on iOS. Which would you pick if both existed in 2027?**

**Follow-up prompts**:
- Is the difference between Skia and real UIKit visible to YOUR users?
- Does CMP's Kotlin source language vs PMTC's TSX matter to your team?
- Is "2 years sooner" worth more or less than "real widgets" for you?

**Code**:
- [ ] **PMTC-prefer** — would pick PMTC even waiting 2 years
- [ ] **CMP-prefer** — CMP's iOS Skia is acceptable; ship-date matters more
- [ ] **Depends** — depends on circumstances (probe for what)
- [ ] Source-language preference: TSX / Kotlin / either

### Q8 — vs Skip (Swift source language)

> **Skip ships today: write Swift+SwiftUI, get an Android app via Kotlin/Compose translation. Source language is Swift, not TSX. Would you switch from Pyreon TSX to Swift to get iOS+Android today?**

**Follow-up prompts**:
- Is your team's TSX investment recoverable in Swift?
- How important is "I want TSX" vs "I want X target" to your team?
- Is there a market for Skip in your circles?

**Code**:
- [ ] **No-switch** — wouldn't leave TSX
- [ ] **Skip-prefer** — would consider Swift if it ships today
- [ ] **Already-considered** — looked at Skip and decided yes/no

### Q9 — Desktop demand

> **How important is desktop (macOS / Windows / Linux native apps) in your roadmap? PMTC's plan defers desktop to "future phases" — would you wait for it, or pick Flutter / CMP which ship desktop today?**

**Follow-up prompts**:
- Which desktop platforms? Mac-only? Cross?
- Is desktop a fallback (when mobile fails) or core?
- Would Electron suffice in the meantime, or do you need native?

**Code**:
- [ ] **Desktop-blocker** — defers PMTC adoption
- [ ] **Desktop-nice** — wants it but not blocking
- [ ] **Desktop-noprio** — not in roadmap
- [ ] Specific need: macOS / Windows / Linux

---

## Section 4 — Alternatives + commitment (10 min)

### Q10 — Counterfactual

> **If PMTC didn't exist and you needed to ship a cross-platform app in 2027, what would you pick? Walk me through your decision.**

**Follow-up prompts**:
- What's the deciding factor — perf, ecosystem, team familiarity, cost?
- Have you already done this evaluation? When?
- What would convince you you picked wrong?

**Code (top 1-2 named alternatives)**:
- [ ] React Native + Expo
- [ ] Flutter
- [ ] Compose Multiplatform
- [ ] Skip
- [ ] Capacitor / Tauri (web-bundled)
- [ ] Native (Swift + Kotlin separate codebases)
- [ ] Hire iOS engineers / different team
- [ ] Other: __________________

### Q11 — Community contribution

> **Beyond just "adoption" — would your team contribute to PMTC if Pyreon open-sourced the compiler work? Bug fixes, widget bindings, testing, documentation?**

**Follow-up prompts**:
- What kind of contribution? Code, docs, testing, advocacy?
- How much time per quarter?
- What's your team's open-source posture today?

**Code**:
- [ ] **Contribute-yes** — would contribute (kind: code / docs / advocacy / testing)
- [ ] **Contribute-conditional** — would contribute if certain conditions met
- [ ] **Contribute-no** — wouldn't contribute, would just adopt

### Q12 — Advocacy potential

> **What would convince you to publicly bet on PMTC — talk about it at a conference, write a blog post, recommend it to clients?**

**Follow-up prompts**:
- What's the credibility threshold? Production deployments? Performance numbers? Test coverage?
- Who are the audiences you'd advocate to?
- What's a recent framework you publicly advocated for, and why?

**Code**:
- [ ] **Advocate-now** — would advocate now (the most positive signal)
- [ ] **Advocate-conditional** — would advocate after concrete milestone X reached
- [ ] **Advocate-no** — wouldn't publicly advocate

---

## Post-interview (5 min)

**Wrap**:

> One last open-ended question: what didn't I ask that you wish I had? What's important about your team's mobile strategy that this survey missed?

> [Open response]

**Logistics**:
- Send transcript / notes within 7 days? (yes / no)
- Permission to share quotes attributed to your role + company? (yes / anonymized / no)
- Permission to follow up with re-survey after Phase 0 ship (Q4 2026)? (yes / no)

---

## Interviewer notes / debrief

Within 1 hour of the call, while it's fresh:

- Overall vibe — did they sound interested, skeptical, indifferent?
- Surprises — anything that contradicted the survey's assumptions?
- Quotes worth flagging — anything they said that should anchor a future positioning doc?
- Codes — fill in the analysis-spreadsheet row (see [`04-analysis-spreadsheet-schema.md`](./04-analysis-spreadsheet-schema.md))
