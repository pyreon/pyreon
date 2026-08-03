# @pyreon/config

One `pyreon.config.ts` for the whole ecosystem — a typed section per package.

```bash
bun add -d @pyreon/config
```

```ts
// pyreon.config.ts
import { defineConfig } from '@pyreon/config'

export default defineConfig({
  atlas: {
    title: 'Acme Design System',
    projects: [
      { name: 'Core', dir: 'packages/core/src' },
      { name: 'Admin', dir: 'packages/admin/src' },
    ],
  },
})
```

## Why

Every tool grew its own file — `atlas.config.ts`, `.pyreonlintrc.json`, options
in a `zero()` call, arguments to `loom`. Each is defensible alone; together they
are four places to look, four formats to remember, and four things to fix when a
project moves a directory.

One file with a key per package is one place to look. The tool that reads a key
still owns what it means, so this stays a routing table rather than a god object.

## Which keys exist

A key appears in the type **only when a package actually reads it**.

That constraint is deliberate. A config surface advertising options nothing
consumes is the typed-but-unimplemented failure this repo runs a CI gate against
(`audit-types`): it typechecks, it autocompletes, and it silently does nothing —
worse than not offering it, because you have no way to tell.

| Key | Read by | Status |
| --- | --- | --- |
| `atlas` | `@pyreon/atlas` | wired |

Other packages land as they are wired, each in the change that makes it real.

Config for a tool this version does not know about is still allowed — unknown
keys are carried through untouched and simply not read, so a newer package or a
plugin does not force everyone to upgrade in lockstep.

## Per-tool files still work

A tool's own config file (`atlas.config.ts`) keeps working and takes precedence
where both exist. Migrating is moving the object under a key:

```ts
// before — atlas.config.ts
export default { title: 'Acme' }

// after — pyreon.config.ts
export default defineConfig({ atlas: { title: 'Acme' } })
```

## License

MIT
