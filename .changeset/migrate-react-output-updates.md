---
'@pyreon/compiler': minor
'@pyreon/mcp': minor
'@pyreon/cli': patch
---

`migrateReactCode` (MCP `migrate_react`, `pyreon check --fix`, `pyreon doctor --fix`) now produces Pyreon that updates. Reads of `useState` / `useMemo` values become `count()`. Setter calls become `count.set(v)` / `count.update(fn)`, and a setter passed as a value becomes a value-or-updater function. `useReducer` becomes a signal plus a `dispatch`. A body-level `const` derived from state becomes a `computed`, and a `return` that reads state outside JSX becomes an accessor. `memo` / `forwardRef` are really unwrapped, and the ref arrives as `props.ref`. `useRef(value)` becomes `{ current: value }`, not a signal. `createRoot(el).render(app)` becomes `mount(app, el)`, `<Fragment>` becomes `<>`, and `useNavigate` / `useParams` / `Link` / `Outlet` map to `@pyreon/router`. `dangerouslySetInnerHTML` and `onChange` on selects and checkboxes are left alone. References are resolved lexically, so shadowing locals are untouched. What cannot be converted safely stays in place with its React import and is listed in the new `MigrationResult.manual` (line and column in the migrated code, reason, suggestion). `migrate_react` lists those notes together with whatever `validate` still finds in the output, and `pyreon check --fix` / `doctor --fix` report them as `not-migrated` findings.

When two planned rewrites overlap, `migrateReactCode` now throws `[Pyreon] migrateReactCode: two rewrites overlap at offset N` instead of silently dropping one, and `diagnoseError` (MCP `diagnose` / `explain_error`) explains that error: find the construct at that offset, convert it by hand, migrate the rest, and report the input.
