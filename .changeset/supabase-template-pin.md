---
'@pyreon/create-zero': patch
---

The supabase integration temporarily EXACT-pins `@supabase/supabase-js@2.112.0`: npm's latest (2.112.1) hard-depends on a `@supabase/realtime-js` version absent from the registry (a mispublish — the version list jumps to `999.9.2-canary.0`), so every fresh scaffold failed `bun install`. 2.112.0 is the newest fully-resolvable release. The caret comes back once upstream ships a resolvable release above the broken one.
