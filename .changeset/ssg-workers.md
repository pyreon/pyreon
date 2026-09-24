---
'@pyreon/zero': minor
---

`ssg: { workers }` — opt-in worker-thread prerendering. Each worker imports the same built SSG entry and renders paths in parallel; template injection and file writes stay on the main thread. Output is byte-identical to the single-thread build. Measured on the Pyreon docs site: 2.9× with 4 workers, 4.1× with 8. Module-level loader state exists once per worker.
