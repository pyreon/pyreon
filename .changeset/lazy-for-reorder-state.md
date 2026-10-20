---
'@pyreon/runtime-dom': patch
---

`<For>` and keyed-array children no longer allocate their reorder buffers (four typed arrays and a `Set`) when they mount. The buffers are created on the first reorder or key removal, which many lists never perform. Measured retained heap for a 1,000-row table with a `<For>` over each row's cells (1,001 lists) dropped by 1,296 KB, about 1.3 KB per list, the same in three runs. Mount time is unchanged within noise.
