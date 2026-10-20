---
'@pyreon/runtime-dom': patch
---

Compiled templates clone from a root element cached at parse time instead of reading `template.content.firstElementChild` on every clone. That's two DOM getter calls saved per row: creating 1,000 rows in the benchmark spends about 70 µs less in JavaScript.
