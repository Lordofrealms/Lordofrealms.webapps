# Pad Grade release process

For every Pad Grade Android version, complete the release documentation **before** starting the final APK build.

1. Finalize the matching `## vX.Y.Z` entry in `pad-grade/CHANGELOG.md` using Added / Changed / Fixed / Known issues as appropriate.
2. Verify the Android `versionName`/`versionCode` and web title identify the intended version and channel.
3. Run the normal Pad Grade Android validation/build only after the changelog entry is present and accurate.
4. Publish the APK with the standard Pad Grade functionality header followed by that exact canonical changelog section.
5. Verify the release body and APK asset after publication before handing the build off for testing.

The release-notes workflow intentionally fails rather than publishing placeholder notes when the canonical changelog has no matching version entry.
