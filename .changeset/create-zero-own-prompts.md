---
'@pyreon/create-zero': patch
---

Drop the `@clack/prompts` dependency (and its transitive `@clack/core`, `sisteransi`, `fast-wrap-ansi`, `fast-string-width`, `fast-string-truncated-width`): the scaffolder's prompts are now a small first-party module with the same call shapes. In a terminal it is the same keyboard UI — ↑/↓ to move, space to toggle, `a` to toggle all, y/n or ←/→ for yes/no, Enter to submit, Ctrl-C or Esc to cancel. When stdin is NOT a terminal (piped answers, a script, CI) it now reads one answer per line — an empty line takes the default, a select accepts the option value or its number, a multiselect accepts a comma-separated list or `-` for none — and end of input cancels. Previously piped input drove clack's terminal UI, which could not be submitted and hung. `--yes` and the explicit flags are unchanged.
