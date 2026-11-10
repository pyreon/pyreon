---
"@pyreon/zero-content": patch
---

Markdown content is parsed in linear time. Several content regexes were quadratic on adversarial input — an unclosed `[`, `<` or `{` run, a long word with no `=` in a code-fence meta string, or `^\s*` under the `m` flag sweeping thousands of blank lines — so a 100 KB page could stall a build or the dev server for seconds. The search-index link and tag stripping, the code-fence meta and code-group label parsers, the frontmatter comment-only check and the `::: name` directive normalization now use linear scans or line-bounded patterns that produce exactly the same output.
