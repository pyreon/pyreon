---
'@pyreon/atlas': patch
---

`atlas verify-browser` no longer attributes a navigation that commits during the capture-settle wait to the NEXT scenario. A handler's queued `location.assign` can land after the click-walk returns on a loaded runner; the replaced-document check now runs after the settle wait (and the reloaded render is settled again), so `navigatedAway` names the scenario that actually left the workbench and never reports a second, phantom one.
