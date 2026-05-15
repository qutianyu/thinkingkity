# Releasing ThinkingKity

## Current release surfaces

| Surface | Current repository support | Distribution path |
| --- | --- | --- |
| macOS | Ready | GitHub Release DMG |
| Linux | Ready | GitHub Release AppImage and deb |
| Windows | Ready | GitHub Release NSIS and MSI |
| Web | Ready | GitHub Release Linux binary |
| Android | CI build wired | Workflow artifact until signing is configured |

## Desktop release flow

1. Ensure the worktree is clean and the changes you want to ship are committed.
2. Run `npm run release -- X.Y.Z`.
3. The release script updates version files, creates a `Release vX.Y.Z` commit, creates tag `vX.Y.Z`, then pushes the commit and tag.
4. Pushing the tag starts `.github/workflows/desktop-release.yml`, `.github/workflows/android-build.yml`, and `.github/workflows/web-build.yml`.
5. Desktop bundles and the Linux web binary `thinkingkity` are attached to the GitHub Release for the pushed tag, then `latest.json` is generated and attached to the same release as the update manifest. Workflow artifacts are also kept on the Actions run for debugging.

Use `npm run release -- X.Y.Z --no-push` when you want to inspect the version commit and tag locally before pushing them yourself.

## Manual build flow

Use the GitHub Actions UI and run either:

- `Desktop Release` for desktop bundle smoke builds
- `Android Build` for Android package smoke builds
- `Web Build` for the web bundle

Manual runs upload workflow artifacts only. GitHub Release assets are uploaded only for tag builds.

## Platform mapping

Desktop builds inject the update identity at build time:

| Build | Update platform | Update arch |
| --- | --- | --- |
| macOS arm64 | `macos` | `aarch64` |
| Linux x64 | `linux` | `x86_64` |
| Windows x64 | `windows` | `x86_64` |
| Android universal | `android` | `universal` |

`About` reads `latest.json` from the latest GitHub Release and uses those build-time values to choose the matching package entry.

## Android follow-up

The repository still ignores generated mobile projects under `src-tauri/gen/`. The Android workflow therefore initializes the Android project inside CI before building APK/AAB artifacts.

This is enough for build verification, but not enough for public Android distribution:

1. Install the Android SDK locally before using `npm run init:android`, `npm run dev:android`, or `npm run build:android`.
2. Configure Android signing before publishing packages outside CI artifacts.
3. Once signing is configured, decide whether Android releases should be attached to GitHub Releases as APKs, uploaded to Google Play as AABs, or both.

Android signing is intentionally separate from the desktop release flow because Android package distribution has its own keystore and store requirements.
