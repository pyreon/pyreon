---
'@pyreon/runtime-dom': patch
---

Keyed `<For>` hydration now ADOPTS the SSR rows instead of rebuilding them. Previously a hydrating `<For>` mounted fresh rows and discarded the server DOM (the documented "true keyed adoption is a perf follow-up" swap); now, when the client's items align 1:1 with the SSR block's `<!--k:KEY-->` markers (same count, keys, order — the dominant real-app case), each row's vnode hydrates in place against its existing DOM range: bindings and delegated events wire onto the server-rendered nodes, node identity is preserved, and the `k:` markers are removed. Any mismatch (different/missing/extra/reordered keys, empty rows, legacy SSR output) bails to the previous clear-and-remount semantics, so correctness is unchanged by construction. Verified by the cross-framework hydration bench's node-identity adoption gate (which previously failed for Pyreon and now passes) and the 5000-seed hydration parity fuzz. Emits the `runtime.mountFor.hydrateAdopt` dev counter.
