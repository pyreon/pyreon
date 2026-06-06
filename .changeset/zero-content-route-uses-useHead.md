---
'@pyreon/zero-content': minor
---

`defineContentRoute` now emits `<title>` and `<meta>` tags from
frontmatter via `@pyreon/head`'s `useHead`.

Closes a real functionality gap: `defineContentRoute` reads
frontmatter at SSG time but previously didn't surface `title` /
`description` as page head tags — every consumer had to wire
`useHead` separately or accept a blank `<title>`.

Default behaviour (zero-config): the entry's frontmatter `title`
becomes `<title>`, and `description` becomes both
`<meta name="description">` and `<meta property="og:description">`.
When `title` is present, an `<meta property="og:title">` is emitted
too. Title-less entries skip `<title>` emission so the parent
layout's default stays in effect.

Override via the new `head` option:
- `head: (entry) => UseHeadInput` — full control (canonical URLs,
  OG images, JSON-LD, etc.)
- `head: false` — skip emission entirely
- `head` omitted — use the default frontmatter-to-head mapping
