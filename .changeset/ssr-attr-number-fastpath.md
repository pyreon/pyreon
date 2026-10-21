---
'@pyreon/runtime-server': patch
---

Compiled SSR templates no longer scan numeric attribute values for HTML escapes. A number's string form never contains a character that needs escaping, and numeric ids and counts are the most common generic attribute on list rows. In the 1,000-row cross-framework SSR benchmark, Pyreon's render dropped by about 12%, with byte-identical output. The `decodeKeyFromMarker` docs now say correctly that hydration does read the per-item `<!--k:KEY-->` markers.
