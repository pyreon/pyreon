---
'@pyreon/cli': patch
---

`pyreon doctor`'s doc-claims gate parses only the source files that can hold a package-runner command (`npx`, `bunx`, `dlx`) instead of all of them, and without parent pointers. Same findings; the whole-repo scan is about ten times cheaper.
