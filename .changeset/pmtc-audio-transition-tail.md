---
'@pyreon/native-compiler': minor
'@pyreon/hooks': minor
---

`<Audio>` now has a Compose implementation. It emitted `PyreonAudioPlayer(…)`
on Android, and the only definition of that name anywhere was the kotlinc
validation stub — so the emit passed the gate and referenced nothing in the real
runtime. Swift has had one all along, so `<Audio>` built on iOS and could not
have built on Android. No example uses it, which is why no device gate said so.

`<Transition>` and `<Audio>` now also carry `data-testid` and the accessibility
props, like every other primitive; both returned before the generic modifier
tail.

The completeness matrix that covers this now derives its list from the type
files rather than hardcoding it — it listed 15 primitives where the types
declare 18, which is how these two were missed.
