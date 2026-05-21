# PMTC User Survey — async form (self-administered)

> Companion to the [`01-survey-form.md`](./01-survey-form.md) live-interview script. This version is for respondents who can't do a 30-45 minute call but will fill out a form. Identical 12-question content; shortened follow-ups; explicit response slots.
>
> **Target tool**: Tally.so (free tier, no account required for respondents), Typeform (paid, prettier), or Google Forms (free, ugly but works). The structure below maps to any of them — copy the questions verbatim, use the response-type hints in `[type: ...]`.
>
> **Estimated completion time**: 15-20 minutes async (vs 30-45 minutes live). Tradeoff: less probe depth, more reach.

---

## Introduction (top of form)

```
PMTC User Research — Pyreon Multi-Target Compiler

We're researching whether Pyreon should invest 2-3 years building a compiler that turns
one Pyreon JSX source into truly-native iOS (SwiftUI) and Android (Kotlin Compose) apps —
with NO JavaScript engine on mobile, just compiled native code.

Your answers help us decide whether to staff this effort or focus elsewhere. Honest answers
matter more than positive ones — we're trying to make the right call, not validate
a predetermined plan.

About 15-20 minutes. 12 questions. We share aggregated results back to all respondents.
We never publish identifying info without your written consent.
```

**Required fields at top**:
- Email (for sharing results — won't be published)
- Name + Company (optional)
- Audio recording consent for any follow-up call (yes / no / "let's see")
- Quote attribution permission (full name + company / anonymized / no quotes)

---

## Section 1 — Current state

### Q1 [type: long-text]

**Tell us about your team's current mobile situation. Do you ship a mobile app today? If yes, what framework? If no, why not?**

Examples of useful answers:
- "We ship a React Native app with Expo SDK 50 — 5 engineers, 50k DAU"
- "We don't ship mobile because our users are desktop-only B2B"
- "We're evaluating CMP for an iOS app we plan to ship in 2026"

[Free-text response, expected 2-4 sentences]

### Q2 [type: long-text]

**If you ship mobile today: what's your single biggest pain point with your current framework?**

If you don't ship mobile, skip to Q3.

[Free-text response, expected 2-4 sentences]

### Q3 [type: number 1-10]

**On a scale of 1-10, how important is "the iOS app uses real UIKit widgets, not drawn Skia pixels"?**

1 = "I don't care what's rendering, looks the same to me"
10 = "Critical — users would notice and complain about drawn widgets"

[Numeric input 1-10]

**Q3b** [type: short-text]: **Briefly: what's driving that score?** (one sentence)

[Free-text response, expected 1 sentence]

---

## Section 2 — Hypothetical adoption

### Q4 [type: radio + text]

**If Pyreon shipped "write one Pyreon source, compile to native iOS + Android + web — truly native widgets, no JS engine on mobile" in Q4 2027, would you migrate your current mobile work to it?**

- [ ] Definitely yes
- [ ] Probably yes
- [ ] Maybe
- [ ] Probably no
- [ ] Definitely no
- [ ] N/A — we don't ship mobile

**Q4b** [type: long-text]: **What would change between "maybe" and "definitely"?** (or between "maybe" and "no", if you went the other way)

[Free-text response]

### Q5 [type: radio]

**Imagine PMTC ships in 2027. Two years from now. What would you do in the meantime?**

- [ ] Wait — no immediate ship pressure
- [ ] Ship something else in 2026 (e.g., React Native, CMP, Flutter), then willing to migrate to PMTC later
- [ ] Ship something else in 2026 and STAY there — PMTC arrives too late
- [ ] Pick a different framework that ships sooner

**Q5b** [type: short-text]: **If "ship something else" — what would you pick?**

[Free-text response]

### Q6 [type: checkbox + text]

**Three things PMTC explicitly gives up. Which are deal-breakers for your team? (Check all that apply)**

- [ ] **Over-the-air updates** (compliance / quick-fix workflow)
- [ ] **React Native ecosystem** of native bindings (specific modules you depend on)
- [ ] **Vite-quality hot reload** (sub-second dev loop)
- [ ] None — all three are acceptable

**Q6b** [type: short-text]: **If "RN ecosystem" is a deal-breaker, which specific native module(s) would PMTC need to replicate?**

[Free-text response, expected: package names]

---

## Section 3 — Trade-off tolerance

### Q7 [type: radio + text]

**Compose Multiplatform ships TODAY with iOS Skia rendering (real Compose widgets on Android; Skia-drawn "looks like UIKit" widgets on iOS). PMTC ships in 2027 with REAL SwiftUI on iOS. Which would you pick if both existed in 2027?**

- [ ] PMTC — real SwiftUI widgets are worth the wait
- [ ] CMP — Skia is fine, ship date matters more
- [ ] Depends on circumstances at that point
- [ ] Neither — would use something else

**Q7b** [type: short-text]: **Is the difference between Skia and real UIKit visible to YOUR users?**

[Free-text response]

### Q8 [type: radio]

**Skip ships today: write Swift+SwiftUI, get an Android app via Kotlin/Compose translation. Source language is Swift, not TSX. Would you switch from Pyreon TSX to Swift to get iOS+Android today?**

- [ ] Yes — would consider Swift if it works today
- [ ] No — wouldn't leave TSX
- [ ] Already evaluated Skip; decided no
- [ ] Already evaluated Skip; decided yes (you're using it)

### Q9 [type: radio + text]

**How important is desktop (macOS / Windows / Linux native apps) in your roadmap?**

PMTC's plan defers desktop to "future phases" — would you wait for it, or pick Flutter / CMP which ship desktop today?

- [ ] Desktop is a blocker — PMTC's defer kills its appeal
- [ ] Desktop is nice-to-have — wouldn't block PMTC adoption
- [ ] Desktop is not in our roadmap

**Q9b** [type: short-text]: **If desktop matters — which platforms? (Mac / Windows / Linux)**

[Free-text response]

---

## Section 4 — Alternatives + commitment

### Q10 [type: dropdown + text]

**If PMTC didn't exist and you needed to ship a cross-platform app in 2027, what would you pick?**

[Pick one]
- React Native + Expo
- Flutter
- Compose Multiplatform
- Skip
- Capacitor (web in WebView)
- Tauri (web in native shell)
- Native (separate Swift + Kotlin codebases)
- Hire iOS engineers / different team
- Other (specify below)

**Q10b** [type: long-text]: **Walk us through your decision — what's the deciding factor?**

[Free-text response]

### Q11 [type: radio + text]

**Beyond just "adoption" — would your team contribute to PMTC if Pyreon open-sourced the compiler work? (Bug fixes, widget bindings, testing, documentation)**

- [ ] Yes — would contribute regularly
- [ ] Maybe — depends on certain conditions
- [ ] No — would just adopt, not contribute

**Q11b** [type: long-text]: **What kind of contribution? (code / docs / advocacy / testing) How much time per quarter?**

[Free-text response]

### Q12 [type: long-text]

**What would convince you to publicly bet on PMTC — talk about it at a conference, write a blog post, recommend it to clients?**

[Free-text response, expected 2-4 sentences]

---

## Bonus — open-ended

### B1 [type: long-text]

**What didn't this survey ask that you wish it had? What's important about your team's mobile strategy that we missed?**

[Free-text response]

### B2 [type: radio]

**Permission to follow up after Phase 0 demo ships (Q4 2026)?**

- [ ] Yes — would do a 15-min follow-up call
- [ ] Maybe — depends on schedule
- [ ] No

---

## Submit

Thanks for taking the time. We share aggregated results back to all respondents in
2-4 weeks. Look for an email with subject "PMTC User Survey — Aggregated Results."

If you indicated quote-attribution permission, we'll email you a draft of any
quote we'd like to use, for your approval, before publishing.
