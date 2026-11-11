---
"@pyreon/lathe": minor
"@pyreon/config": patch
---

Lathe now treats a spec as untrusted input when it follows `$ref`s.

- **Breaking (behaviour):** a local `$ref` must resolve inside the root spec's directory. A `../` escape, an absolute path, a `file://` URL or a symlink pointing out (real paths are compared in the CLI and the Vite plugin) now fails the run before the file is read, instead of reading it into the generated client. Set the new `refRoot` option (relative to the config file) to widen the boundary on purpose.
- `lathe pull` and `remoteRefs: 'fetch'` fetch a referenced document only from the referencing document's own origin, and check every redirect hop by the same rule. Name other origins with the new `refOrigins` option or `lathe pull --ref-origin <origin>`; `'*'` allows any public origin but still refuses loopback, private and link-local addresses.
- Bundling a split spec stops with an error past a node budget (1,000,000 plus 10 per input node) instead of expanding a `$ref` fan-out exponentially.
- A tag named after a Windows device (`con`, `nul`, `com1`, …) gets a safe file stem (`con-api`) in every per-tag file, and `naming.file` may not return one.
