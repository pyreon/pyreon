---
title: "90 days of building Pyreon in public, and what we keep doing"
description: "Publishing our losses, a log of our own retractions, bugs fixed in the open, a post every week. The practices behind this blog, where every live number lives, and what comes next."
date: 2027-03-01
slug: 90-days-of-building-in-public
tags: [opensource, javascript, buildinpublic, webdev]
cover: /blog/covers/90-days-of-building-in-public.png
---

Building in public is easy for a week. Anyone can post a win. The hard part is the week your benchmark turns out to be wrong, the week a reader finds a bug in your launch post, the week the number you were proud of turns into a tie. That is the week that decides whether anyone should believe you.

This blog started with fifteen posts, one a week, about how Pyreon works and how well. Here is what that taught us, the habits we are keeping for good, where to check every number yourself, and what comes next.

## What "in public" means here

It means you can check us without asking us. Every claim on this blog points at something you can open: a compiler output you can regenerate, a benchmark you can re-run, a pull request with the diff. When a post says "Pyreon wins", it links the record. When it says "Pyreon loses", it links the same record.

We publish where we lose, so you can trust where we win. That line runs through the whole series, and it is the one practice we would keep if we had to drop all the others.

## Four habits we are keeping

### 1. Losses get the same page as wins

The benchmark record has a section whose whole job is to list where Pyreon is not the fastest: deep component trees, bundle size, signal creation, some chart mounts, router and store rows. It sits in the same file as the wins, with the same intervals and the same reproduce commands. [Where Pyreon is not the fastest](/blog/where-pyreon-is-not-the-fastest) walks the whole list.

### 2. The record logs its own retractions

Section 0 of [`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md) opens with what changed and what we withdrew. A harness bug that handicapped a rival, a CSS default that inflated our own lead, confidence intervals that counted five page loads as a hundred samples: each one became a pull request and a re-run, and the published verdicts changed with it. [We keep retracting our own benchmark wins](/blog/we-keep-retracting-our-benchmark-wins) tells every one of those stories.

The rule that follows from it: the benchmark record is the source of truth. If a post on this blog differs from it, the record wins.

### 3. Bugs get fixed in the open

Writing this series meant running every compiler output, every tool message and every CLI command again against the code. That turned up real bugs, and they went straight into the public tracker instead of into a private to-do list: a hybrid Zero build where a prerendered home page replaced the Node server's template ([#4250](https://github.com/pyreon/pyreon/issues/4250)), and two native-compiler cases that compiled with no warning ([#4251](https://github.com/pyreon/pyreon/issues/4251)). Every change to the framework lands as a pull request with its tests, and every release carries a changelog that an AI assistant can read through the MCP `get_changelog` tool.

### 4. Something new every week

The blog was the first rhythm. It is not the last one (see below).

## Where every live number lives

A post is a snapshot. These pages are not:

- **[pyreon.dev/open](https://pyreon.dev/open):** stars, downloads and releases, refreshed daily.
- **[The benchmark record](/docs/benchmarks):** every measured number, both runs, competitor versions and the commands to reproduce it.
- **[GitHub issues](https://github.com/pyreon/pyreon/issues):** what is broken and what is being worked on, including the bugs we found ourselves.
- **[GitHub releases](https://github.com/pyreon/pyreon/releases)** and each package's `CHANGELOG.md`: what shipped, version by version.
- **[The multiplatform capability matrix](/docs/multiplatform):** what the native targets do, credited only for behaviour a test asserts on a simulator or emulator.

If a number in any post disagrees with one of these, trust the live page.

## What comes next: the always-on series

Fifteen posts was the opening. From here, the project runs on recurring formats, each with a fixed name and day:

| series | when | what you get |
| --- | --- | --- |
| **Delete This** | Monday | a before/after code card: something you no longer write in Pyreon |
| **60-Second Build** | Tuesday | one small thing built start to finish, in a short video |
| **Under the Hood** | Wednesday | a thread on how one feature works inside, like how `<For by>` keeps rows |
| **One Codebase** | Thursday | the same screen on the web, an iPhone and an Android phone |
| **Ship Friday** | Friday | things people built with Pyreon that week, from Discord's #show-and-tell |
| **Ask the Framework** | twice a month | an AI assistant building a feature with the Pyreon MCP, recorded |
| **State of Pyreon** | first Monday of the month | what shipped and what's next, as a short video and in the [newsletter](https://pyreon.dev/newsletter) |
| **Live build** | monthly | an hour of building something real, live, with questions in chat |

Built something? Post it in #show-and-tell on [Discord](https://pyreon.dev/discord). Ship Friday is made of your projects.

## The road toward 1.0

We will not put a date on 1.0, because the repository does not have one, and this series does not invent claims. Here is what the [stability and direction page](/docs/stability-and-direction) states:

- **Pyreon is pre-1.0.** Every `@pyreon/*` package ships as one fixed version group, breaking changes are minor bumps while the version is `0.x`, and CI refuses a changeset that declares a major bump.
- **The core web framework** (reactivity, core, runtime-dom, router, head, server, vite-plugin) is the surface most apps use. **The native targets are experimental**, and the capability matrix shows exactly how far each area is proven.
- **Directions under consideration**, explicitly not scheduled: native errors mapped back to your `.tsx` source and a documented TestFlight and Play submission path; more first-party native service bindings (payments, push, analytics) and a way for packages to ship their own native sources; a documented answer for updates between store releases; AI-agent rules for native projects to match the web scaffold; end-to-end test recipes and a CI template for generated apps.

If one of those gaps blocks you, say so in a GitHub issue. The page itself calls that the most useful input we can get, and it is how the list gets ordered.

## Come build with us

```bash
npm create @pyreon/zero@latest
```

Or, for web, iOS and Android from one codebase:

```bash
npm create @pyreon/multiplatform@latest
```

- Docs: [pyreon.dev/docs](/docs)
- Live numbers: [pyreon.dev/open](https://pyreon.dev/open)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord), get State of Pyreon in the [newsletter](https://pyreon.dev/newsletter), or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
