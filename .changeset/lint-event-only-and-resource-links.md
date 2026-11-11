---
'@pyreon/lint': patch
---

Three false positives that made `bun run lint` fail on a freshly scaffolded create-zero project are fixed.

- `pyreon/no-window-in-ssr` no longer reports browser globals in code that only runs in response to a browser event: a JSX `on*` handler or `ref` callback, an `on*` option callback such as `useForm({ onSuccess })`, and a local function referenced only from those (resolved through chains of helpers). Server rendering never calls these. Code that does run during SSR is still reported: module scope, the component body, helpers it calls, timers and promise callbacks it schedules, accessors rendered as children, non-event props, exported functions, and names bound more than once.
- `pyreon/no-href-navigation` no longer reports `<a>` links to resources that are not pages: API routes (`/api/…`), files (`/rss.xml`, `/report.pdf`), protocol-relative URLs, and links with `download` or `target`. A `<Link>` would hand those to the client router.
- `pyreon/no-unvalidated-request-body` recognises validators named for what they validate (`parseNewPost(body)`, `validateSignup(body)`, `assertUser(body)`), not only the bare names `parse` / `validate` / `assert`.
