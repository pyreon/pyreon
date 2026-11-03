---
'@pyreon/native-compiler': minor
---

Component-scope destructuring now lowers nested patterns (`const { user: { name } } = profile()`), array holes (`const [, second] = xs()`) and a trailing array rest (`const [head, ...tail] = xs()`, lowered as `.slice(1)`) on iOS and Android. Each binding becomes a path read off one container, the same IR the explicit forms produce. An object rest, a default, and a nested pattern over a hook result (whose fields are signal accessors) still warn by name.
