---
'@pyreon/cli': minor
---

cli: add `pyreon info` — environment + installed `@pyreon/*` versions + version-skew detection

`pyreon info` reports the CLI version, runtime (node/bun/platform), the project
name (and whether it's a `@pyreon/zero` app), and every `@pyreon/*` package
installed in `node_modules` with its version. Because Pyreon ships its packages
on one synced version trajectory, `info` flags **version skew** when the
installed set spans more than one version — the condition that can trip the
`registerSingleton` duplicate-instance guard (`[Pyreon] Duplicate @pyreon/X
detected`) and split context/reactivity across instances at runtime.

```bash
pyreon info          # env + installed @pyreon versions + skew check
pyreon info --json   # machine-readable report
```

Self-contained — reads only the project's `package.json` + `node_modules/@pyreon/*`,
so it works in any project (or none) with no framework packages required. The pure
core (`collectInfo` / `scanInstalledPyreon` / `detectSkew` / `formatInfo`) is
exported for programmatic use.

Also fixes `pyreon --version`, which was hardcoded to `0.4.0` and now reads the
package's real version.
