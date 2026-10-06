---
"@pyreon/native-cli": patch
---

`pyreon-native explain` parses against the compiler's own registries, so a plugin-supplied service or element is lowered and attributed to its owning plugin (element lowerings are listed per file), and `plugins` lists the registered element lowerings with their owners.
