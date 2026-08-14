---
'@pyreon/native-compiler': minor
---

Warn when a `<Transition name>` has no native translation

`<Transition name="fade">` and the slide/scale family lower to each platform's
own transition. Anything else — a custom CSS animation, `zoom-in`, `bounce` —
falls back to a fade on iOS and Android. That fallback is correct, but it was
SILENT: on the web the author's `${name}-enter-*` CSS runs, on device it
fades, and because a fade still plays there is no symptom to investigate.

The translatable vocabulary now lives in ONE module both emitters consume, so
a name can never be known to Swift and unknown to Kotlin — which would itself
be a per-platform animation divergence. Unknown names warn once per target,
naming the divergence and listing what does translate. Behaviour is unchanged:
this warns, it does not refuse.
