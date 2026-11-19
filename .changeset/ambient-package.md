---
"@pyreon/ambient": minor
---

New package `@pyreon/ambient` (Experimental): the ambient values every formatted thing depends on.

- **Locale and time zone:** `locale`, `setLocale`, `provideLocale`, `timeZone`, `setTimeZone`, `provideTimeZone`, with the behaviour `@pyreon/format` shipped (resolution order, validation, request isolation).
- **Clock:** `now`, `setClock`, `provideClock` and `useNow({ every, zone })`: one shared ticker per granularity, aligned to the wall-clock boundary (local hour and midnight in the active zone, exact across DST changes), scheduled from the clock so a late timer does not drift, refcounted, paused while the page is hidden, bounded, and never created on a server or at import.
- **Server to client hand-over:** `clockScript`, `clockAttributes` and `releaseClock` make the first client render read the instant the server rendered at, then hand real time back with one update.
- **Install shape:** `@pyreon/core` and `@pyreon/reactivity` are REQUIRED peers (the entry imports them when it loads).
