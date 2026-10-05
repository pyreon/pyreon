---
"@pyreon/atlas": patch
---

Fix `atlas scan` mounting components against a different module graph than the one the config was loaded into. When `atlas.config.*` declares an explicit `alias`, the scan rebuilds its module loader for the components but kept the config (wrapper, theme, authored scenarios, `projects`, presets) from the loader it had just closed — so every local module shared between config and components (a context a wrapper provides, say) existed twice and the configured provider never reached the components. The config is now re-loaded through the replacement loader.
