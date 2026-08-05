---
'@pyreon/native-compiler': patch
---

PMTC no longer accepts `attrs(Base)`, a call shape `@pyreon/attrs` rejects at runtime. The signature is `attrs({ name, component })`; the bare form throws `Parameter \`component\` is missing in params!` at mount, so a shared source using it compiled clean on iOS and Android and rendered a blank page in the browser. The compiler had been taught to accept it on the strength of a comment claiming the bare form was "the form the library actually exposes, per its own docs" — the README and manifest have always shown the options object, and the belief traces to a prose shorthand in a capability line being read as a call signature. The bare form is now refused with a named warning that carries the corrected call, so the three targets fail consistently rather than two of them silently succeeding.
