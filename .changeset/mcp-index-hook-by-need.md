---
'@pyreon/mcp': patch
---

`get_anti_patterns({})` now adds a one-line hook only where the entry's TITLE is too terse to identify it on its own. This catalog's convention is that a title carries the whole claim, so on a long title the hook was a truncated restatement of the body that cost as much as the title and added nothing to discovery. Measured over 236 entries: 8,064 index tokens instead of 11,329 (hooks kept on 88, dropped on 148), taking the index from 94% of the 12,000-token design boundary to 67% — from roughly 14 entries of headroom to 115. Discovery stays a single call; the drill-downs (`name`, `category`, `full`) are unchanged.
