---
'@pyreon/native-compiler': patch
---

A bare `arr.sort(cmp)` statement now sorts the array in place on iOS and Android. It used to lower to the non-mutating `sorted(by:)` / `sortedWith` with the result thrown away, which left the array unsorted with no error. The native chart engine's boxplot read its quartiles off unsorted data because of this. A sort used as a value (`const s = xs.sort(cmp)`) still lowers to the non-mutating copy.
