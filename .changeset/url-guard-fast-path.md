---
"@pyreon/core": minor
"@pyreon/runtime-dom": patch
---

perf(url-guard): `isUnsafeUrl` first-char fast path — skip the regex for the safe common case

The shared URL-injection guard (`@pyreon/core/url-guard`, used by BOTH the SSR `renderProp` and the client `setStaticProp`/DOMParser sanitizer) tested `UNSAFE_URL_RE = /^\s*(?:javascript|data):/i` on every URL-bearing attribute. New `isUnsafeUrl(url)` adds a `charCodeAt(0)` fast path that is PROVABLY equivalent: a `^\s*(?:javascript|data):` match needs the first non-whitespace char to be `j`/`J` or `d`/`D`, so a first char in printable ASCII (33–126) that isn't one of those cannot match — return safe without the regex (`http…`→`h`, `/…`, `#…`, `mailto:`→`m`, digits, …). Conservative on the margins: whitespace (≤32, ASCII controls the regex can skip) and non-ASCII (≥127, possibly UNICODE whitespace like ` `/` ` which `\s` matches — a naive `c > 32` predicate would WRONGLY pass these) fall through to the authoritative regex.

Security is unchanged — every `javascript:` / `JavaScript:` / ` javascript:` / `\tdata:` / ` javascript:` still reaches and is rejected by the regex; `data:image/*` on image contexts still allowed. Locked by a 5000-seed equivalence fuzz + an explicit unicode-whitespace matrix (bisect-verified: the naive `c > 32` predicate fails both the equivalence and security tests on ` javascript:`). `renderProp`, the client guard, and the SSR fast-path's `_ssrAttrUrl` all route through it, so both render paths get the win and stay byte-identical.
