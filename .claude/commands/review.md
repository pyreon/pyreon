Review recent changes for correctness and quality.

Steps:

1. Run `git diff` to see unstaged changes, or `git diff HEAD~1` if no unstaged changes
2. For each changed file, read the full file to understand context
3. Check for:
   - Type safety issues (missing types, unsafe casts)
   - Missing test coverage for new code paths
   - Performance regressions (unnecessary allocations, missing batch calls)
   - Dead code or unused imports
   - Consistency with existing patterns in CLAUDE.md
4. Report findings as a bulleted list with file:line references
5. Suggest specific fixes for each issue found
