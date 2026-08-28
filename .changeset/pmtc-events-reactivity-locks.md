---
'@pyreon/native-compiler': patch
---

Two verified negative results are now gated: every documented event prop reaches
the emit on both targets, and every signal-valued prop emits differently from
the same prop given a static value (so it stays live rather than freezing).

Each carries a positive control, because the first version of the reactivity
sweep grepped the emit for the signal's NAME — which always appears, since the
signal is declared — and so reported "all clean" without being able to report
anything else.
