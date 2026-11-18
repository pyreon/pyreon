---
'@pyreon/compiler': patch
'@pyreon/mcp': patch
---

`detectPyreonPatterns` (MCP `validate`, `pyreon check`, `pyreon doctor`) catches two more documented "components run once" mistakes:

- `props-early-return-conditional`: `if (props.loading) return <Skeleton/>` (or `return null`) at the top of a component body. The `if` reads the prop once, at mount, so a reactive prop never moves the component off its first branch. Use `<Show when={() => props.loading}>` or a returned accessor. It is a separate code from `static-early-return-conditional` because a single file cannot show whether the parent passes a reactive value; for a prop that never changes, silence the line with `// pyreon-lint-ignore props-early-return-conditional`.
- `props-object-copy`: `Object.assign({}, props, …)` or `{ ...props }` in a component's setup scope copies the values, not the getters. Use `mergeProps` / `splitProps`. JSX spreads (`<div {...props}>`), copies inside JSX and copies inside handlers or effects are not flagged.

MCP `diagnose` (`diagnoseError`) gains entries for both symptoms ("stuck on the skeleton", a props copy that never updates).
