Create a new release from the current main branch.

Usage: /release <version>

Steps:

1. Verify we're on the `main` branch with a clean working tree
2. Run `git pull` to get latest
3. Run the full validation pipeline (lint, typecheck, test)
4. If $ARGUMENTS is provided, use it as the version (e.g. "0.7.14")
5. Update all packages/_/_/package.json versions using sed
6. Commit with message "chore: release v<version>"
7. Create git tag v<version>
8. Push commit and tag to origin
9. Report the release version and remind about CI publish
