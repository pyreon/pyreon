---
'@pyreon/zero-content': minor
---

Search now shows an empty state when a query finds nothing.

Previously a no-match query rendered an empty list (the overlay just looked
blank). `<Search>` now renders a `.pyreon-search__empty` message — defaulting to
`No results for "<query>"`, customizable via the new `noResultsText?: (query) => string`
prop. `useSearch` exposes a `status` signal (`idle` | `searching` | `ready`); the
empty state shows ONLY after a search actually completes (`ready`), so it never
flashes during the debounce / index-load window for a query that will match.
