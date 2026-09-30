---
'@pyreon/charts': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Two gaps in the keyed `<Chart by>` morph are closed. On iOS and Android, value labels no longer jump to their new place while the bars slide: every value label of a keyed chart carries its row key, and the native tween hides keyed labels until it lands — what the web morph already did. And a line with gaps now morphs by key on every target: the engine keys each unbroken run with its own rows (and the series by its label), native matches a point across runs a gap opened or closed, and the web morph breaks the line at a gap instead of bridging it mid-animation. A curved line keeps the positional tween on native, where curves do not lower.
