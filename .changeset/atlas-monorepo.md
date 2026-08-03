---
'@pyreon/atlas': minor
---

Monorepo support — one site from several packages, and the silent collapse that blocked it.

```ts
export default {
  title: 'Acme Design System',
  projects: [
    { name: 'Core',  dir: 'packages/core/src' },
    { name: 'Admin', dir: 'packages/admin/src' },
  ],
}
```

**The bug this had to fix first.** The catalog graph keyed components by NAME
(`byName.set(ci.name, ci)`), so a workspace where two packages each export a
`Button` kept ONE and dropped the other — no error, no warning, nothing in the
output to notice. The same name fed `scenarioId`, so their scenarios collided in
`atlas-catalog.json`, in their verify verdicts, and in their snapshot filenames.
That is the silent-drop this tool exists to prevent, committed by the tool.

So a component now has an IDENTITY (`componentKey`) — `project/Name` in a
monorepo, bare `Name` otherwise — carried alongside its real `name`. The two
answer different questions: identity answers "which component is this", the name
answers "what do I type in my import". Both `Button`s survive, with distinct
scenario ids (`core-button--…`, `admin-button--…`) and readable catalog ids.

Where a bare name is now ambiguous, Atlas refuses and names the candidates
rather than picking one:

```
[Pyreon] atlas: "Button" matches 2 components across projects
(Core/Button, Admin/Button). Ask for one of those keys.
```

`pages` and authored `scenarios` accept either form: `'Core/Button'` targets one
package, a bare `'Button'` applies wherever it is unambiguous — and to both when
it is not, which is why the key form exists.

Single-package projects set no `project`, so every derived key, id and group is
byte-identical to before. This is a widening, not a migration.

**Also fixed, found while testing this:** `atlas scan --no-mount` ignored
`atlas.config.ts` **entirely**. The config was loaded only when scenarios were
being mounted, on the reasoning that it is "only meaningful when mounting" —
true of `wrapper` and `theme`, false of `projects`, `title`, `pages` and
authored `scenarios`, all of which were silently discarded. A monorepo scan
under `--no-mount` therefore found nothing and reported it as a project with no
components. The config is now always loaded, and a config that exists but cannot
be used (or has a malformed export) is REPORTED — `runScan` returns
`configError`, and `atlas scan` / `dev` / `build` print it. It was previously
computed and thrown away at every call site.
