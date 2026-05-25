---
description: Pyreon Zero project rules
globs:
  - "**/*.{ts,tsx}"
alwaysApply: true
---

# Pyreon Zero

This is a Pyreon Zero project — a signal-based full-stack meta-framework. **Do not use React patterns** (useState, useEffect, className, etc.).

{{principles}}

## When in doubt

The MCP server at `.mcp.json` exposes a `validate` tool that statically catches React→Pyreon mistakes. Run it on suspicious snippets before committing.
