---
'@pyreon/zero': minor
'@pyreon/router': patch
---

Server functions for `@pyreon/zero`: a route's `action` export (a `defineAction()`) now handles a plain HTML form POST to its page WITHOUT JavaScript — the server runs it, then answers `303 See Other` for a `redirect()` or re-renders the page with the result. New `<Form>` renders that form and enhances it to `fetch` when JavaScript runs; new `useSubmission(action)` exposes `pending`, the optimistic `input`, `result`, `status` and `error`, and re-runs the current route's loaders after a successful mutation (`revalidate: false` or a list of loader keys to target). New `fail(status, data)` returns an expected failure with its HTTP status. Page form posts share the actions endpoint's same-origin check, and every action request is now capped at 1 MiB (`createServer({ actions: { bodyLimit } })`, `413` above it). A `redirect()` from an action called directly now navigates instead of failing with 500.

`@pyreon/router`: `router.revalidate()` now re-renders the current page with the fresh loader data; previously the data was refreshed but the leaf kept rendering the old `useLoaderData()` value.
