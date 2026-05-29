# PMTC User Survey — recruitment outreach templates

> Copy-paste-ready templates for the 3 respondent segments named in [`native-platforms-user-survey.md`](../native-platforms-user-survey.md).
>
> **Targets**: 20-30 respondents total.
>
> - Segment A (active Pyreon users): 10-15
> - Segment B (signal-framework users / prospective adopters): 5-10
> - Segment C (native-first / cross-platform-curious teams): 5-8
>
> **Channels**: direct email > Twitter/Mastodon DM > forum post (in that order — direct is highest signal). Forum posts are last because they self-select for the loud minority.

---

## Segment A — active Pyreon users (10-15 respondents)

**Source candidates from**:

- GitHub stars on `pyreon/pyreon` (filter to users with >20 followers as a quality proxy)
- npm download stats — top 20 organizations by `@pyreon/*` weekly downloads
- Pyreon Discord active members
- Anyone who's opened a non-trivial GitHub issue in the last 6 months
- Anyone who's used the `MCP get_pattern` / `get_anti_patterns` tools (proxy for "actually building with Pyreon")

### Direct email — short version

**Subject**: Pyreon native-mobile research — 15-20 min of your time?

```
Hi <name>,

I'm researching whether Pyreon should invest 2-3 years building a compiler that
turns one Pyreon JSX source into truly-native iOS and Android apps (real SwiftUI
+ real Compose, no JavaScript engine on mobile).

You came up because <specific reason — they starred the repo / opened issue #X /
contributed PR #Y / mentioned Pyreon at $conf>. I'd love your honest take on whether
this is worth building.

15-20 minutes async (an online form), or 30-45 minutes live (video call, your
preference). I'll share aggregated results back to all respondents in a few weeks.

Async form: [link]
Pick a live time: [calendly link]

Either way — your time is valuable, so I'm offering $50 USD or equivalent
in Pyreon swag for completed responses. (Yes, this is opt-in incentive.)

Thanks,
<sender>
```

### Direct email — context-heavy version (for users who'll want more before clicking)

**Subject**: Pyreon Multi-Target Compiler — research call?

```
Hi <name>,

Quick context: Pyreon is researching its native-mobile strategy. The two real
options:

  1. Pyreon Multi-Target Compiler (PMTC) — compile JSX source to native SwiftUI on iOS,
     native Compose on Android. Zero JS engine on mobile. 2-3 year build, real native
     widgets, no Skia / drawn rendering.

  2. Don't build it. Stay web-focused; accept that mobile is out of Pyreon's scope.

Phase 0 of PMTC has shipped (compiler structurally working, iOS counter compiling to
valid SwiftUI). But before staffing the full 2-3 year build, we want honest market
signal: do enough Pyreon users actually need this?

That's where you come in. 12-question survey, 15-20 minutes async or 30-45 live.
Honest "we wouldn't use this" answers are AS valuable as "yes, please ship it" —
we're trying to make the right call, not validate a predetermined plan.

You came up because <specific reason>. Your perspective specifically matters because
<role-specific reason — "you ship a real app on Pyreon" / "you publicly bet on signal
frameworks" / etc.>.

Async form: [link]
Live call: [calendly link]

$50 USD or Pyreon swag for completed responses.

Decisions get made on aggregate signal across 20-30 respondents — your one response
is meaningful both as data and to anchor the analysis.

Thanks,
<sender>
```

### Twitter / Mastodon DM — short

```
Hi <name>! Pyreon team here — researching native-mobile strategy. 15-20 min survey
on whether to build a PMTC (Pyreon → real SwiftUI/Compose, no JS engine on mobile)
or skip it. You'd be a great voice in the data — care to share your take?

Link: [survey]
$50 honorarium for completed responses.
```

### Twitter / Mastodon public post (if direct outreach undersells the target)

```
Pyreon is researching whether to invest 2-3 years building a Multi-Target Compiler:
one Pyreon JSX source → real native SwiftUI on iOS + real Compose on Android + web.
No JS engine on mobile.

Before staffing, we need honest signal: who actually wants this? 12-Q survey,
15-20 min, $50 honorarium for completed responses.

Especially want to hear from: people shipping mobile today, people who explicitly
chose NOT to ship mobile, native-first teams curious about cross-platform.

Survey: [link]
Aggregated results published 4 weeks after close.
```

---

## Segment B — signal-framework users / prospective adopters (5-10 respondents)

**Source candidates from**:

- Solid Discord / GitHub Discussions — users discussing native mobile
- Svelte Discord — similar
- Recent Hacker News commenters on signal-framework threads
- npm trends "who depends on solid-js" / "vue" — find shops not already on Pyreon

These respondents likely haven't tried Pyreon. The outreach must lead with WHY they're qualified, not assume they know Pyreon.

### Email template

**Subject**: Cross-platform framework research — signal-framework user opinion needed?

```
Hi <name>,

You've publicly discussed <Solid / Svelte / signal-based frameworks>. The Pyreon team
(another signal-based framework, like Solid but with full-stack tooling) is researching
whether to build a Multi-Target Compiler — one source → real native iOS + Android +
web. No JavaScript engine on mobile.

Before staffing 2-3 years of build, we need outside perspective from people who've
chosen signal frameworks. You'd be a great voice because <specific reason — you wrote
about your Solid migration / you maintain a signal-framework adjacent library / etc.>

Why you specifically: you have informed opinions about signal-framework tradeoffs.
The survey asks about native-mobile gaps you've hit, what compromises you'd accept,
and which competing frameworks (React Native, Flutter, CMP) you'd actually use.

15-20 minutes async. $50 USD honorarium. Aggregate results shared with respondents.

Survey: [link]

We're not selling you on Pyreon — we want honest signal on whether the proposed
PMTC strategy is worth pursuing. "We wouldn't use this" is as valuable as "yes".

Thanks,
<sender>
```

---

## Segment C — native-first / cross-platform-curious teams (5-8 respondents)

**Source candidates from**:

- iOS / Android conference speakers
- Authors of recent blog posts comparing CMP / Skip / Flutter / RN
- Authors of public posts about "choosing a mobile framework"
- React Native Discord — users actively unhappy with their stack
- Flutter Discord — same
- Compose Multiplatform users (recently migrated to / from CMP)

These respondents probably aren't Pyreon users. Outreach must establish credibility quickly.

### Email template

**Subject**: Native-mobile framework research — your opinion as a <iOS engineer / RN dev / Flutter team>?

```
Hi <name>,

I'm researching native-mobile compiler strategy for Pyreon (a signal-based JS framework
similar to Solid). You came up because of your <specific public artifact — your post
"Why we left Flutter" / your iOS conf talk / your CMP migration writeup>.

We're considering building a Multi-Target Compiler that turns Pyreon JSX into native
SwiftUI on iOS and native Compose on Android — real platform widgets, no JS engine.
2-3 year build, then a viable cross-platform option for teams who don't want to drop
to two separate native codebases.

Before committing 2-3 years of engineering, we want honest signal from people who've
actually evaluated the alternatives. Your experience with <Flutter / CMP / RN / native>
makes you exactly the audience to ask.

15-20 minutes async. $50 USD honorarium. We share aggregated results with respondents.

Survey: [link]

Honest negative signals matter — "your real-SwiftUI value prop is overrated because X"
is the kind of answer that would change the build decision. Skeptical responses are
welcome.

Thanks,
<sender>
```

---

## Public forum posts (last resort, lowest signal-quality)

Only after direct outreach hits ≥15 respondents. Forum posts self-select for the
loud minority — the silent majority who'd give different answers don't post.

### Hacker News (Show HN — careful)

DON'T use Show HN. The audience is too generalist; you'll get RN partisans and
"why-not-Flutter" pile-ons that drown signal.

### Lobsters / Pyreon forum / specific Discord channels

```
[META] PMTC User Research — survey is open

Pyreon is researching whether to build a Multi-Target Compiler (PMTC). The proposal:
one Pyreon JSX source compiles to real native SwiftUI on iOS, real Kotlin Compose
on Android, web stays as-is. No JavaScript engine on mobile.

The 2-3 year build commitment is significant. Before staffing, we want honest signal:
do enough users actually want this? Or should we focus elsewhere?

12-question survey, 15-20 min async, $50 USD honorarium for completed responses:

  [survey link]

Equal weight on yes/no answers. "We wouldn't adopt this" matters as much as
"yes please ship it" — we're trying to make the right call.

Aggregated results shared with all respondents 4 weeks after close.

Open until [date — 4 weeks out].
```

---

## Recruitment tracking template

Track in a spreadsheet ([`04-analysis-spreadsheet-schema.md`](./04-analysis-spreadsheet-schema.md)
shows the rest of the schema; this is just the recruitment side):

| Segment | Name   | Org   | Channel      | Status                                     | Notes                |
| ------- | ------ | ----- | ------------ | ------------------------------------------ | -------------------- |
| A       | <name> | <org> | direct-email | pending / scheduled / completed / declined | <why-they-qualified> |

Daily review: did the previous day's outreach get responses? Adjust segment balance.

Target: hit 20-30 by N+21 days (3-week recruitment window). If A is undersold by week 2,
shift email weight from C → A.
