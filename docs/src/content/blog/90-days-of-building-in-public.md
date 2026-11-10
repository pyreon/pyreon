---
title: "90 days of building Pyreon in public"
description: "Three launches, sixteen weeks of posts, and the scorecard: what reached people, what fell flat, and the numbers, unflattering ones included."
date: 2027-03-01
slug: 90-days-of-building-in-public
tags: [opensource, javascript, buildinpublic, devrel]
cover: /blog/covers/90-days-of-building-in-public.png
draft: true
---

{/*
SKELETON. Fill on the day (Mon 1 Mar 2027) from live data. Rules:
- Every {{placeholder}} is a number pulled on the day, with its source in the
  "Where the numbers come from" table. If a number cannot be pulled, delete the line;
  do not estimate.
- Stars/downloads are allowed here ONLY as live, dated numbers (facts.md forbids quoting them
  anywhere else from memory).
- Same honesty bar as BENCHMARKS.md: report the misses with the same care as the hits.
  Lead the "what didn't work" section with the biggest miss.
- No adoption claims ("used by X") unless a named user agreed in writing to be named.
- Target 800–1,200 words when filled. Delete every HTML comment before publishing.
- Voice: first person singular (founder post), "we" for the project.
*/}

Ninety days ago we started showing Pyreon to the world, every weekday, in public. Three Show HN launches, {{blog_posts_published}} blog posts, {{videos_published}} videos and {{social_posts_published}} social posts across {{channel_count}} channels later, here is the scorecard: what reached people, what fell flat, and what I'm changing next quarter. The misses get the same detail as the hits. That's how we run the benchmark record, and it's how we run this retro.

{/* Replace the paragraph above with a CONCRETE first sentence about the single most
     surprising result of the quarter (good or bad). Example shape:
     "Our most-read post was the one about our benchmark losses: {{b14_views}} reads,
     {{b14_vs_median}}× the median post." */}

## What we posted

| week | theme | blog | launch |
| --- | --- | --- | --- |
| 1 | Components run once | B01 | — |
| 2 | We publish our retractions | B02 | — |
| 3 | Launch 1 | B03 | Show HN, 1 Dec |
| 4 | Hydration that adopts server DOM | B04 | — |
| 5 | AI wedge | B05 | — |
| 6–7 | Holidays: 12 days of Pyreon, 2026 review | B06 | — |
| 8 | Full stack (zero) | B07 | — |
| 9 | Native tease | B08 | — |
| 10 | Launch 2 | B09 | Show HN, 19 Jan |
| 11 | React migration | B10 | — |
| 12 | Reactivity rules | B11 | — |
| 13 | lathe | B12 | — |
| 14 | Launch 3 | B13 | Show HN, 16 Feb |
| 15 | Where we're not the fastest | B14 | — |

{/* Mark any post that slipped or was cut, and say why in one line. */}

## The numbers

> Pulled {{pull_date}} at {{pull_time}} CET. Every number is a snapshot on that day.

| metric | 16 Nov 2026 | 1 Mar 2027 | change |
| --- | ---: | ---: | ---: |
| GitHub stars | {{stars_start}} | {{stars_end}} | {{stars_delta}} |
| npm weekly downloads, `@pyreon/core` | {{dl_start}} | {{dl_end}} | {{dl_delta}} |
| Discord members | {{discord_start}} | {{discord_end}} | {{discord_delta}} |
| Newsletter subscribers | {{news_start}} | {{news_end}} | {{news_delta}} |
| Docs site unique visitors (30 days) | {{docs_uv_start}} | {{docs_uv_end}} | {{docs_uv_delta}} |
| Issues opened by people outside the project | — | {{ext_issues}} | — |
| PRs merged from outside contributors | — | {{ext_prs}} | — |

{/* Download counts move with CI mirrors and bots. Add one line saying so, and whether
     you used a filtered source. */}

### The three launches

| launch | date | HN peak rank | HN points | comments | docs visits (48 h, utm=hn) |
| --- | --- | ---: | ---: | ---: | ---: |
| L1 signals + retractions log | 1 Dec | {{l1_rank}} | {{l1_points}} | {{l1_comments}} | {{l1_visits}} |
| L2 one .tsx → SwiftUI/Compose | 19 Jan | {{l2_rank}} | {{l2_points}} | {{l2_comments}} | {{l2_visits}} |
| L3 built for AI assistants | 16 Feb | {{l3_rank}} | {{l3_points}} | {{l3_comments}} | {{l3_visits}} |

{/* If a launch never left /newest, say exactly that. */}

### Which channels sent readers to the docs

| channel (utm_source) | docs sessions | share |
| --- | ---: | ---: |
| hn | {{s_hn}} | {{p_hn}} |
| blog (pyreon.dev/blog) | {{s_blog}} | {{p_blog}} |
| devto | {{s_devto}} | {{p_devto}} |
| reddit | {{s_reddit}} | {{p_reddit}} |
| x / bluesky / mastodon / threads | {{s_social}} | {{p_social}} |
| youtube | {{s_youtube}} | {{p_youtube}} |
| newsletter | {{s_news}} | {{p_news}} |

## What worked

{/* 3–4 items, each: what we did → the measured effect → why we think it worked.
     Candidates to check against the data (keep only those the numbers support):
     - Publishing our losses (B02, B14) next to our wins.
     - Real compiler output (Swift/Kotlin) instead of screenshots in the native launch.
     - Real tool output in posts (validate, explain_reactivity) instead of described output.
     - Answering every HN/Reddit comment on launch day. */}

1. **{{worked_1_title}}.** {{worked_1_evidence}}
2. **{{worked_2_title}}.** {{worked_2_evidence}}
3. **{{worked_3_title}}.** {{worked_3_evidence}}

## What didn't

{/* Lead with the biggest miss. Same shape: what → measured effect → our best explanation
     (say "we don't know" when we don't). Include at least one content miss and one
     process miss. Candidates: a channel that produced ~0 docs sessions; a post with
     the lowest reads; a claim a commenter showed was wrong (link the correction). */}

1. **{{miss_1_title}}.** {{miss_1_evidence}}
2. **{{miss_2_title}}.** {{miss_2_evidence}}
3. **{{miss_3_title}}.** {{miss_3_evidence}}

## What the feedback changed

{/* Concrete changes to the framework or docs that came from public feedback, each with
     its PR/issue link. If a benchmark verdict moved because of an outside report,
     it belongs here AND in BENCHMARKS.md §0. */}

- {{feedback_change_1}} ({{link_1}})
- {{feedback_change_2}} ({{link_2}})
- {{feedback_change_3}} ({{link_3}})

## Corrections we published

{/* Every factual correction to a post during the quarter, with date and what changed.
     If there were none, write "None that we know of. Tell us if you found one." */}

{{corrections_list}}

## Lessons

{/* 3 lessons, each one sentence plus one sentence of evidence. Prefer lessons that change
     what we do next quarter over general observations. */}

1. {{lesson_1}}
2. {{lesson_2}}
3. {{lesson_3}}

## Next quarter

{/* 3–5 commitments with a measurable finish line and a date. Pull candidates from the
     honest-limits sections of B09–B14 (e.g. submit the staged krausest implementation;
     re-run the scenario suite with cluster CIs; publish a per-feature bundle breakdown),
     but only commit to what is planned. */}

| commitment | done when | by |
| --- | --- | --- |
| {{next_1}} | {{next_1_done}} | {{next_1_date}} |
| {{next_2}} | {{next_2_done}} | {{next_2_date}} |
| {{next_3}} | {{next_3_done}} | {{next_3_date}} |

## Where the numbers come from

| number | source |
| --- | --- |
| stars | GitHub API, pulled {{pull_date}} |
| downloads | npm downloads API, `@pyreon/core`, last-week window |
| docs sessions by channel | site analytics, utm_source, {{date_range}} |
| HN rank / points | HN item page and a rank tracker, archived {{archive_links}} |
| Discord / newsletter | platform admin dashboards, {{pull_date}} |

## Limits / what's not done

{/* What this retro cannot tell you: e.g. analytics blocked by ad blockers undercount
     a technical audience; downloads include CI; we have no adoption data and do not claim any. */}

- {{limit_1}}
- {{limit_2}}

## Join in

The most useful thing you can do after 90 days of reading about Pyreon is try the part you were skeptical of, and tell us where it broke.

```bash
npm create @pyreon/zero@latest
```

- Docs: [pyreon.dev/docs](/docs)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on Discord{/* DISCORD-INVITE: link the permanent invite here once it exists */} or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
