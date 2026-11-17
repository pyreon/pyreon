---
'@pyreon/compiler': patch
---

Plain Mode `signalOf(x)` now passes the signal itself inside JSX. The pre-pass lowered it to the bare signal, which the JSX compiler then read as a value, so `<Field value={signalOf(draft)} />` or `onClick={() => register(signalOf(draft))}` handed over the current value instead of the signal (`.set` was not a function). It now stays the signal on every element and in both compiler backends. Code that relied on the old behaviour (a `signalOf` in JSX meant as a read) should use the plain read `draft` instead. Classic (non-Plain-Mode) output is unchanged.
