---
'@pyreon/server': patch
---

A self-activating `<pyreon-server-island>` marker now fetches its fragment under the active router's base. It passed no base, so on a sub-path deploy (`zero({ base: '/sub/' })` or `vite build --base /sub/`) it requested `/_pyreon/fragment/…` at the host root, which 404s behind a proxy that forwards only `/sub/*`. The router's data endpoint already carried the base.
