# Releasing ThinkingKity

## Current release surfaces

| Surface | Current repository support | Distribution path |
| --- | --- | --- |
| macOS | Ready after Apple signing/notarization secrets are configured | GitHub Release DMG |
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

## macOS public distribution

The macOS GitHub Release artifact is only suitable for normal end-user download after it has been signed with a `Developer ID Application` certificate and notarized by Apple.

Configure these repository secrets before shipping macOS releases publicly:

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` export of the `Developer ID Application` certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` file |
| `APPLE_SIGNING_IDENTITY` | Signing identity name, for example `Developer ID Application: Example Inc. (TEAMID)` |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_API_ISSUER` | App Store Connect API issuer ID |
| `APPLE_API_KEY` | App Store Connect API key ID |
| `APPLE_API_KEY_PATH` | Full contents of the App Store Connect `.p8` private key |

When those secrets are present, the macOS workflow writes the App Store Connect API key to disk and lets `tauri build` handle certificate import, signing, and notarization using the same environment-variable contract already used by the `terax-ai` release workflow.

If those secrets are missing, CI can still produce a DMG for internal smoke testing, but a DMG downloaded from GitHub is expected to be blocked by Gatekeeper on other Macs with messages such as `“ThinkingKity” is damaged and can’t be opened`.

This keeps ThinkingKity aligned with the already-working `terax-ai` macOS release path instead of maintaining a custom certificate-import shim in this repository.

After bundling, the macOS job also verifies the generated `.app` with `codesign --verify` and `spctl --assess`. A green release job therefore means the app was not only built, but also accepted by macOS code-signing and Gatekeeper checks on the CI runner.

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
