---
"@pyreon/mcp": patch
"@pyreon/lathe": patch
---

Validate tool arguments before they reach `git` or the filesystem. `explain_api_diff` and `lathe diff` reject a `<rev>:<path>` whose revision is not a git revision (one starting with `-` was parsed by `git show` as an option) and pass `--end-of-options` to `git`. `explain_api_diff`, `get_api_client` and `get_api_operation` now only read paths that resolve, through symlinks, inside the project root (the MCP server's working directory).
