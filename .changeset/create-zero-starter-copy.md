---
'@pyreon/create-zero': patch
'@pyreon/cli': patch
'@pyreon/lint': patch
---

Starter-app fixes in `create-pyreon-app`:

- The code samples on the app starter's home, counter, posts and dashboard pages kept their line breaks only in source. JSX drops a line break between children (in every JSX implementation, `<pre>` included), so they rendered as `state(0)const doubled = …`. Each line now ends with an explicit `{"\n"}`.
- The next-steps note uses the package manager the scaffolder was invoked with (`npm_config_user_agent`): `npm install` / `npm run dev` after `npm create`, `pnpm dev` after `pnpm create`, and so on. The monorepo template keeps bun, because its root scripts call `bun run --filter`.
- The lint prompt said "59 Pyreon-specific rules"; the registry has 133. The prompt is now a `lint-rule-count` claim surface of the doc-claims gate (`@pyreon/cli`), so CI fails when it drifts again.
- The starter footer reads "signal-based, fine-grained" instead of "blazing fast".
- `pyreon/no-secret-in-shared-module` treats `npm_config_user_agent` as environment plumbing, not a secret. Package managers set it to name themselves.
