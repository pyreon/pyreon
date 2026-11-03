---
'@pyreon/charts': patch
---

Fix animated chart updates drawing bars outside the plot. The value domain was resolved once per frame before the update tween, so every interpolated frame was scaled by the NEW data's domain — shrinking 1000/900/800 to 10/9/8 drew mid-tween bars far above the plot top. The same early resolution also left a toolbox magicType stack switch scaled by the unstacked domain. The domain is now resolved once per frame on the spec that is actually painted, keeping the single-scan saving.
