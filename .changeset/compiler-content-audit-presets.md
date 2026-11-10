---
'@pyreon/compiler': patch
---

The content audit (`pyreon doctor`) recognises collections that are not a literal `defineCollection({...})`: a preset such as `blogCollection()`, a factory call, or a collection held in a variable. Each gets its literal `path` when it passes one, and `src/content/<name>` otherwise. Before, every post of a `blogCollection()` collection was reported as an orphaned markdown file.
