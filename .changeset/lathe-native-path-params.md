---
'@pyreon/lathe': minor
---

Lathe now generates a native data component for an operation with a PATH PARAMETER, taking the parameter as a prop.

`GET /books/{bookId}` previously produced no native component at all — lathe skipped any operation with a path param, because PMTC resolved the endpoint URL to a compile-time constant. The generated native surface therefore covered collection endpoints only, which is the less useful half of an API.

PMTC now lowers a runtime `:param` through `useQuery`, whose native harness is keyed on the resulting URL and so re-fetches when the value changes. The emitted component takes the parameter as a prop and reads it as `props.x` — never a destructure, which would freeze the value and stop the query re-fetching.

On the bookshelf example this takes native reach from 2/4 to 3/4 operations, with both generated modules verified `lowers` on Swift and Kotlin.

Requires the PMTC change that makes a runtime path param lowerable; lathe's own verifier reports the components as `web-only` without it.
