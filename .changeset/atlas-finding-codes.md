---
'@pyreon/atlas': minor
'@pyreon/mcp': minor
---

**Verify findings are structured — catalog `version: 2`.**

A finding was a prose sentence. An agent handed `"hydrateRoot threw: Cannot read properties of undefined"` could say what was wrong and never say what KIND of wrong it was — the only thing to branch on was a string free to be reworded in any release.

Every finding is now `{ code, message, fix? }`:

```
✗ button--empty
    a11y [missing-accessible-name]: missing accessible name: "label" is empty
      → Give "label" a non-empty value, or an aria-label if the text is decorative.
```

- **`code`** is a stable identifier for the CLASS of failure — `mount-threw`, `hydrate-threw`, `hydrated-dom-differs`, `reactive-nodes-retained`, `missing-accessible-name`, and one for every reason a check did not run (`browser-only`, `no-dom`, `no-gc-hook`, `no-ssr-renderer`, `not-run`, `nothing-to-check`). Permanent once shipped: a reworded message is a patch, a renamed code is a breaking change.
- **`fix`** names the one concrete thing to change, and travels WITH the finding rather than in a lookup table a consumer has to know to consult — so the agent guide, the MCP tools and `atlas verify --json` all carry the actionable half without a second call. Absent when no single next step exists, rather than invented.

**Fixes a silent drop the change exposed.** Both the catalog renderer and the MCP surface collected findings from a hand-written list of five check names. `ssrParity` was added as a sixth and neither list learned about it — so a hydration failure was recorded in the catalog, marked the scenario failed, and then vanished from the agent guide, the llms text and the MCP tools: the surfaces an AI assistant actually reads. Both now derive from the verdict itself, which cannot go stale. `CHECK_KEYS` moved from `plugins/registry` down to `core/types`, beside the type it enumerates, so `core` can use it without importing upward.

**`@pyreon/mcp` refuses a stale catalog** rather than rendering blanks. At v1 findings were strings; reading one with v2 code yields `undefined` for every finding, so a component's failures display as empty — silently wrong, to a reader that cannot tell a blank is anomalous. The loader now checks the version and names the fix (`re-run atlas scan`).
