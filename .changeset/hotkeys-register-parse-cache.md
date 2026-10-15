---
'@pyreon/hotkeys': patch
---

Registering and unregistering shortcuts is about 40% faster. Parsed shortcut strings are cached, since a component that binds shortcuts re-registers the same strings every time it mounts (`mod` still resolves for the current platform). Unregistering is now constant-time, and a registration that passes no options shares one default options object.
