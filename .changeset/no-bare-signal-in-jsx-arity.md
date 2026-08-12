---
'@pyreon/lint': patch
---

`pyreon/no-bare-signal-in-jsx` no longer fires on a call that passes arguments.

A signal read is zero-arg by construction (`sig()`), so `{formatDefault(value)}` can
never be the shape this rule is about. It previously flagged such calls and then told
the reader, in the finding itself, that a non-signal pure function should be ignored —
a finding that asks to be disregarded is worse than none, because it teaches people to
skim past the whole rule's output.

This removes the false-positive class rather than any single instance. The rule's
behaviour on genuine zero-arg signal reads is unchanged.
