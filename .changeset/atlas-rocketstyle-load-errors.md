---
'@pyreon/atlas': patch
---

Report files the rocketstyle pass could not LOAD, instead of counting them as empty.

`discoverRocketstyle` caught every load failure and `continue`d, on the reasoning
that "a module that will not load has nothing to introspect". But a file that
throws and a file with no rocketstyle in it produce the same zero, and only one
of them is a finding — so a broken import upstream made a whole package look
like it simply had no components.

Measured on `@pyreon/ui-components`: one unresolvable `exports` entry made all 77
files throw on import, and the scan reported **7 components** for a 108-component
package with no error anywhere. With the load errors surfaced, the same broken
state now says `77 file(s) could not be LOADED` and names the cause; with the
underlying `exports` fixed it reports 108 components, 1090 scenarios, 67 carrying
real variant axes.

Load errors are printed BEFORE the unmatched list and grouped by message — one
broken import throws the identical error in every file that reaches it, so the
distinct causes are the finding and the file count is the severity. They are
reported separately from `unmatched` because the fix is different: an unmatched
file needs a `theme` in the config, a file that threw needs its import fixed, and
telling the second to try the first sends the reader after the wrong thing.
