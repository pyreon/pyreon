---
'@pyreon/ui-core': patch
'@pyreon/native-compiler': patch
---

Recognize aliased native UI providers and preserve their registered colour scope. Scope lookup applies the same module/import guard as the provider renderer, so foreign components with matching names remain unclaimed.
