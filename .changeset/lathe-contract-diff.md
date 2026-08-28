---
'@pyreon/lathe': minor
---

Lathe now detects breaking contract changes between spec revisions.

A spec edit is the one change in this pipeline that can break an app without breaking a build. Delete a response field, regenerate, and everything still typechecks — against the new types, which agree with the new spec and with nothing the app was written for. The failure arrives at runtime, as a value that is suddenly `undefined`.

Generation now writes `api-surface.json` beside the client: a compact record of what the run promised. The next run diffs against it and classifies every difference from the CLIENT's side, which is not symmetric with the server's — a response field removed or made optional is breaking, one added is not; a request parameter added as required is breaking, one removed is not.

```
contract  2 breaking  1 additive
  ! [field-removed]      Book.pages   was integer
  ! [field-now-optional] Book.status  required → optional
  + [field-added]        Book.isbn    string (optional)
```

`--fail-on-breaking` exits non-zero when any breaking change is present — opt-in, because on a feature branch the spec is supposed to move and a gate that fires there gets disabled rather than heeded. Every change carries a stable `code` so a script or an agent can branch on it, and `--json` carries the full list.

A missing or wrong-version baseline reports nothing rather than every operation as added.
