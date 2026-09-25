---
'@pyreon/document': minor
---

Harden every renderer against output injection, and fix several render/DX bugs.

Security:

- `sanitizeHref` / `sanitizeImageSrc` are now ALLOWLISTS (`http`, `https`, `mailto`, `tel`, relative; plus `data:image/…` for images). The old blocklist was bypassed by a leading control character (`\x01javascript:`) or an entity-encoded scheme (`&#106;avascript:`). Control characters are stripped from accepted URLs.
- PDF links/buttons and inline links in PDF and DOCX paragraphs are now sanitized (they previously wrote the raw href into a live link annotation). Inline links are sanitized once in `getInlineRuns`, so every inline-link consumer is covered.
- Markdown, Teams and Discord link/image destinations are percent-encoded so a `)` or space in a URL cannot close the link and open a second one. Slack `<url|label>` URLs are entity/percent-encoded so `>` or `|` cannot inject `<!channel>`.
- Markdown text (headings, paragraphs, lists, table cells, captions, alt text) is escaped, so raw HTML such as `<img onerror>` and markdown metacharacters are no longer live. Discord text is escaped the same way; Teams and Google Chat list items now get the same escaping as other text.
- Code blocks cannot be closed by their content: Markdown uses a fence longer than any backtick run; Slack/WhatsApp/Discord/Teams break ``` runs in content with a zero-width space. Code language tags are restricted to `[\w+#.-]`.
- CSV: text cells starting with `=` `+` `-` `@` tab or CR are prefixed with `'` (formula injection); numbers are untouched. Cells containing `\r` are quoted, and the table caption is written as a quoted cell so a newline cannot inject a row.
- Email links/buttons with `target="_blank"` carry `rel="noopener noreferrer"`.

Bugs / DX:

- XLSX sheet names derived from headings are normalized to Excel's rules (forbidden `[]:*?/\` removed, 31-char cap, case-insensitive dedupe, `Sheet N` fallback) — a heading like `Q1/Q2: [draft]` made `render()` throw.
- `render()` now has per-format overloads: `pdf`/`docx`/`xlsx`/`pptx` resolve to `Uint8Array`, every other built-in format to `string`; a custom format string still returns `RenderResult`. New exported types `BinaryOutputFormat` and `TextOutputFormat`. Calls that passed the format `as never` now resolve to `Uint8Array` — drop the cast.
- A link or button whose href is rejected renders as its plain label instead of an empty link (`[label]()`, `label: `, `<a href="">`, an Adaptive Card / Slack button with no url).
- Inline links inside paragraphs now keep their href in Notion, Discord and Teams output.
- `download()` gives binary Blobs their MIME type, revokes the object URL on a later task instead of synchronously after `click()`, and checks for a browser before rendering.

Behaviour changes: link destinations with schemes outside the allowlist (including `data:` links, `ftp:`, `file:` and custom app schemes) are now dropped; Markdown/Discord output contains backslash escapes for markup characters in text.
