---
'@pyreon/http': patch
---

`:name` placeholders are read in the path only (#4816). The substitution scanned the whole string, so a request whose literal query string or fragment held a colon followed by a letter threw before it was sent (`api.get('/search?tag=a:b')`, `/search#x:y`: "needs the parameter "b""). Everything from the first `?` or `#` is now sent as written, on every target: `applyPathParams`, the type-level `PathParamNames` (which no longer asks for `params: { b }` on such an endpoint) and the native lowering for Swift and Kotlin all cut at the same point. The `\:` escape still reads as a literal colon after the cut, so a path built with every colon escaped produces the same URL as before.

Also fixed: a `query` option combined with a `#fragment` written in the path template was appended AFTER the fragment (`/doc#x?a=1`), so the query was part of the fragment and never reached the server. URLs are now built as path + query + fragment (`/doc?a=1#x`, `/doc?v=2&a=1#x`) on the web and in the Swift / Kotlin URLs the native lowering emits; a `?` inside the fragment is no longer mistaken for an existing query.
