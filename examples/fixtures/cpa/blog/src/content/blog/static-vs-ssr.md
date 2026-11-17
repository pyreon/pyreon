---
title: Static or server-rendered?
description: This blog is built as static HTML. When that is the right call, and when to switch a route to SSR.
date: 2026-04-14
tags: [ssg, ssr]
---

This project builds in **SSG** mode: `bun run build` renders every page — the index, each post, each tag page — to an HTML file in `dist/`. Any static host can serve it, and there is no server to run.

## When static is right

A blog changes when you publish. Between deploys every reader gets the same page, so rendering it once at build time is the cheapest and fastest option.

## When to reach for SSR

Switch a route to server rendering when its HTML depends on the request: the signed-in user, a search query, live data. Zero renders per route, so the blog can stay static while another route renders on the server — see [render modes](https://pyreon.dev/docs/zero).

## Scheduled posts on a static site

A static site decides what is published when it is built. A post dated next week goes live with the first build on or after that date, so a scheduled deploy (a daily CI job, for instance) publishes it on the day.
