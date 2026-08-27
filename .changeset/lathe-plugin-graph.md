---
'@pyreon/lathe': patch
---

Expand a plugin selection along the import edges of the emitted code.

`plugins: ['components']` emitted previews importing `./queries/...` that were
never generated, and `plugins: ['atlas']` emitted `mocks.ts` importing a
`./client` that did not exist — output that looks complete and does not
resolve. These are import edges in the generated code, not preferences, so a
selection is now expanded to cover them and the report names what came along:

```
plugins: components (+schemas, +client, +queries - required by them)
```

Expanded rather than refused: someone asking for `components` wants browsable
previews, and the hooks they are built from are an implementation detail of
that answer.

`components` does **not** depend on Atlas — the previews are ordinary Pyreon
components over the generated hooks, so a project that wants them without a
workbench selects `components` and gets exactly that. The dependency runs one
way only, and a test now walks every emitted relative import across every
plugin combination to keep it that way.
