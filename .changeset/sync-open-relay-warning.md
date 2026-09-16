---
'@pyreon/sync': patch
---

sync: say so at startup when the relay accepts every connection

`createSyncServer` without an `authorize` hook accepts every connection, so any
client that can reach the port can join any room and read and rewrite its
document. That default is for local development, and it was documented as such —
but only in a doc comment, which is read while writing the first call and not
while promoting it to production.

The relay now warns once per server instance when `authorize` is absent, naming
the option. The warning fires in production as well as development: an open
relay is a live misconfiguration an operator has to see, not a developer-time
nicety. Supplying `authorize` silences it.
