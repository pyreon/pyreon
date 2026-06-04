---
"@pyreon/zero": minor
---

feat(zero): `fontPlugin({ subsets })` — opt-in Google Font subset scoping for self-hosting

Self-hosting a Google font previously downloaded + emitted **every** subset the
family ships — Ubuntu returns six (`latin`, `latin-ext`, `cyrillic`,
`cyrillic-ext`, `greek`, `greek-ext`), each a separate `@font-face` + `woff2` —
so a Latin-only site shipped (and deployed) all of them. The new opt-in
`font: { subsets: ['latin', 'latin-ext'] }` narrows the emitted set (≈ −40% of
self-hosted font weight on the example `Inter:wght@400;500;600;700;800` config).

**Zero runtime change** — the browser already skips unrequested subsets at
runtime via `unicode-range`; the savings are build output, deploy size, and
static-host quota.

Mechanism: Google's `css2` API **ignores** a `&subset=` URL param (verified —
`&subset=latin` still returns all six subset blocks), so the plugin filters the
returned CSS by its per-subset comment labels (new exported
`filterCssBySubsets`) **before** extracting font URLs — one spot governs
downloads, emitted assets, and the inlined CSS.

- **Opt-in** — omit `subsets` to keep every subset (no behavior change). A
  `['latin']` default would silently break Cyrillic / Greek / Vietnamese pages.
- **Self-host only** — no effect with `selfHost: false` or in dev.
- **Fail-safe** — an allowlist that matches no subset (a typo), or a CSS with no
  recognizable labels, keeps all subsets rather than ship a fontless build.
- The subset allowlist is part of the `node_modules/.cache/zero-fonts` cache key,
  so two configs differing only in `subsets` can't collide on a stale entry.
