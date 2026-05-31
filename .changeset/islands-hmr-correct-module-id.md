---
'@pyreon/vite-plugin': patch
---

fix(vite-plugin): use the resolveId-returned id (`ISLANDS_REGISTRY_ID`) for HMR invalidation of the islands registry

PR-S12 introduced transform-hook invalidation of the `virtual:pyreon/islands-registry` module so that adding / renaming / removing an `island()` declaration mid-`vite dev` updates the auto-registry without a manual full reload. The fix used `getModuleById(\`\\0${ISLANDS_REGISTRY_IMPORT}\`)` = `\\0virtual:pyreon/islands-registry`. But `resolveId` returns `ISLANDS_REGISTRY_ID = '\\0pyreon/islands-registry'` (no `virtual:` prefix — Vite stores the virtual module under the id `resolveId` returned). The lookup always missed → `invalidateModule` never fired → **PR-S12's stated bug ("the new island silently fails to hydrate until a manual full reload") shipped UNFIXED.**

Single-character fix: use the constant `ISLANDS_REGISTRY_ID` that `resolveId` itself returns. Behaviour now matches the documented intent of PR-S12 — adding an `island()` mid-dev invalidates the virtual module and the next request triggers a fresh `load` hook.

Surfaced by an audit of all framework commits since v0.25.1 (sequential 7-agent workflow).

Bisect-verified-with-restore: reverting to the wrong-id form fails the new regression spec with `AssertionError: expected [Array(1)] to include '\\u0000pyreon/islands-registry'` (the stub dev server captured the constructed `'\\u0000virtual:pyreon/islands-registry'` instead). Restoring → 252/252 green.

Regression coverage in `packages/tools/vite-plugin/src/tests/islands-registry.test.ts` (`PR-S12: hardening` describe block) — a stub `_devServer.moduleGraph.getModuleById` records every id passed to it; asserts the constant `ISLANDS_REGISTRY_ID` is among them on an island-declaration-change.
