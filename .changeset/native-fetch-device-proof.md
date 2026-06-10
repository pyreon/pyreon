---
'@pyreon/hooks': minor
'@pyreon/native-compiler': patch
---

useFetch lands on web (`@pyreon/hooks`) — thin reactive JSON fetch (`{ data, error, isPending, refetch }`) matching the multiplatform `useFetch<T>(url)` contract PMTC compiles to native `PyreonFetch` containers; abort-safe on refetch/unmount (stale responses can never clobber fresh ones). Native compiler: synthesized Kotlin data classes now carry `@Serializable` (consistency with named-struct emit — inline object types used in fetch decode previously failed real kotlinx-serialization compilation).
