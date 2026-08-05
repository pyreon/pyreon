---
'@pyreon/loom': patch
---

`loom scan --json` now writes the report and nothing else to stdout, so `loom scan . --json > report.json` produces a valid JSON file.

It did not before. The write notice (`  → /path/loom-report.json`) went to stdout *after* the document, so the documented machine surface produced a file no JSON parser could read — in the DEFAULT configuration, since `--json` still writes the report unless `--no-write` is passed. The notice now goes to stderr under `--json`, which changes nothing for a human at a terminal (both streams land there) and makes a redirect correct. Human mode is untouched: there, the narration IS the requested output.

Every pre-existing `--json` test passed `--no-write`, so the default combination was never exercised — and the assertion that did check stdout parsed `out.split('  →')[0]`, stripping the notice before parsing. That split made the spec pass while stdout was polluted, so it could never have caught this. It now parses stdout whole.
