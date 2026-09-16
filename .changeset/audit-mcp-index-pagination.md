---
'@pyreon/mcp': patch
---

`get_anti_patterns` compact index is paginated by category (`page?: number`, page 1 by default; its footer names the categories on later pages). The catalog reached 392 entries and the single-response index crossed the 12,000-token design boundary the token-budget gate holds at — the structural fix that gate asks for, rather than a bigger number.
