---
'@pyreon/flow': patch
---

Native iOS: each flow node now has its own accessibility frame and receives drags. Nodes were placed with `.position`, which reported the whole canvas as every node's frame; they are now offset in a top-leading stack with the offset applied after the gestures, so the hit area moves with the node.
