# Pad Grade release pipeline

## Dev release tag anchoring

GitHub can reject `gh release create --target <dev SHA>` with `403 Resource not accessible by integration` when the target commit contains `.github/workflows/**` changes relative to the default branch. The built-in Actions `GITHUB_TOKEN` has `contents: write` but cannot be granted the additional workflow-write authority needed to create that tag at the dev commit.

Pad Grade DEV releases therefore use a lightweight distribution tag anchor:

1. `.github/workflows/pad-grade-dev-release-tag-anchor.yml` resolves the current `versionName` on `pad-grade-dev`.
2. Before the much slower Android build reaches its release step, it creates `pad-grade-dev-v<version>` at the current default-branch (`main`) commit when that tag does not already exist.
3. `.github/workflows/pad-grade-android.yml` still checks out and builds the actual APK from `pad-grade-dev`.
4. The Android workflow creates/updates the GitHub prerelease using the already-existing version tag and uploads the APK built from the dev branch.
5. The Android Actions run remains the authoritative provenance for the exact dev source SHA used to build the APK; the release tag is only a distribution anchor.

This avoids requiring a PAT/GitHub App secret with workflow-write permission and does not alter the Pad Grade application binary or version.
