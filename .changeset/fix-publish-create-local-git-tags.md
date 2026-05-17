---
'@pyreon/reactivity': patch
---

Release pipeline: `scripts/publish.ts` now creates the local `<name>@<version>` git tag before emitting each `New tag:` line.

Without this, `changesets/action` would parse the `New tag:` lines (populating `outputs.published`) but then fail when its tag-push step tried `git push origin <name>@<version>` — the local tag didn't exist (`src refspec X does not match any`). The step exited non-zero, the gated umbrella GitHub Release step skipped, and `release-native.yml` never triggered → 7 platform compiler binaries never published.

The 0.18.0 release hit exactly this path: all 55 npm packages published successfully, but the post-publish step failed → no v0.18.0 tag, no GitHub Release, no native binaries until manual recovery.

Mirrors what `changeset publish` (the CLI command) does natively — emit `New tag:` AND create the local annotated tag. Idempotent: skips creation if the tag already exists locally (retried runs work).

Also fixes the `actions/download-artifact` SHA pin in `release-native.yml` — the prior pin `cc20338…` was a transcription error; real v5.0.0 SHA is `634f93cb…`. Every Publish job in the v0.18.0 run 25873293958 failed at "Set up job" with `Unable to resolve action … unable to find version <SHA>` because of this. No prior release exercised the code path (previous workflow_dispatch runs used `publish: 'false'` which skips the publish matrix). Both bugs together blocked native binaries from publishing alongside the npm release.
