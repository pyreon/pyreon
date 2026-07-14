---
"@pyreon/primitives": patch
"@pyreon/mcp": patch
---

docs(primitives): document `init`/`resetPrimitivesConfig` and name the full escape-hatch trio in the manifest. Adds the router-agnostic runtime-config entry (`init({ navigate })` upgrades `<Link>` from a full-reload `<a href>` to SPA navigation; `resetPrimitivesConfig` clears it for tests) — a real footgun that was undocumented. Also renames the escape-hatch entry `Web` → `Web / NativeIOS / NativeAndroid` so all three components are discoverable by name, with a source-verified summary (`<NativeIOS>`/`<NativeAndroid>` return null on web; PMTC emits their children only on the native target). Regenerates the MCP api-reference + docs-site reference page.
